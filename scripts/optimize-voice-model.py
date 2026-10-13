"""Remove unused encoder attention outputs from the pinned ONNX graph.
Weights and computation stay unchanged; six ~72 MB output tensors need not
remain alive during text-only inference. Protobuf schema: onnx/onnx.proto.
Run against a fresh upstream encoder, then rebuild resource-manifest.json.
"""
from pathlib import Path
import argparse

def varint(data, pos):
    value = shift = 0
    while True:
        byte = data[pos]; pos += 1; value |= (byte & 127) << shift
        if byte < 128: return value, pos
        shift += 7
        if shift > 63: raise ValueError('Invalid protobuf varint')
def encode(value):
    out = bytearray()
    while value >= 128: out.append((value & 127) | 128); value >>= 7
    out.append(value); return bytes(out)
def fields(data):
    pos = 0
    while pos < len(data):
        start = pos; tag, pos = varint(data, pos); wire = tag & 7; payload = None
        if wire == 0: _, pos = varint(data, pos)
        elif wire == 1: pos += 8
        elif wire == 5: pos += 4
        elif wire == 2:
            size, pos = varint(data, pos); payload = data[pos:pos + size]; pos += size
        else: raise ValueError('Unsupported protobuf wire type')
        yield tag >> 3, wire, payload, data[start:pos]
def output_name(data):
    return next((p.decode() for n, w, p, _ in fields(data) if n == 1 and w == 2), '')
def optimize(data):
    removed = []; parts = []
    for number, wire, payload, raw in fields(data):
        if number != 7 or wire != 2: parts.append(raw); continue
        graph = []
        for n, w, p, segment in fields(payload):
            if n == 12 and w == 2 and output_name(p).startswith('encoder_attentions.'):
                removed.append(output_name(p)); continue
            graph.append(segment)
        graph = b''.join(graph); parts.append(encode(58) + encode(len(graph)) + graph)
    if len(removed) != 6: raise ValueError('Expected the pinned encoder with six attention exports')
    return b''.join(parts), removed
if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('input'); parser.add_argument('output'); args = parser.parse_args()
    data, removed = optimize(Path(args.input).read_bytes()); Path(args.output).write_bytes(data); print(removed)
