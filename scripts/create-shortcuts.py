"""Create transparent shortcut templates. Sign with Apple's CLI before sharing.
No audio/image/text is sent to a service by these workflows.
"""
from pathlib import Path
import plistlib, uuid

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://floki-u.github.io/Yujournal/'

def uid(name): return str(uuid.uuid5(uuid.NAMESPACE_URL, BASE + name)).upper()
def token(kind, **value):
    return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': kind, **value}}
def output(identifier, name): return token('ActionOutput', OutputUUID=identifier, OutputName=name)
def text_token(prefix, attachment):
    return {'WFSerializationType': 'WFTextTokenString', 'Value': {
        'string': prefix + '\ufffc', 'attachmentsByRange': {f'{{{len(prefix)}, 1}}': attachment['Value']}}}
def action(identifier, key, **parameters):
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.' + identifier,
            'WFWorkflowActionParameters': {'UUID': uid(key), **parameters}}
def workflow(name, actions, sharing=False):
    return {'WFWorkflowName': name, 'WFWorkflowClientVersion': '3036.0.1',
            'WFWorkflowMinimumClientVersion': 900, 'WFWorkflowMinimumClientVersionString': '900',
            'WFWorkflowHasShortcutInputVariables': sharing,
            'WFWorkflowInputContentItemClasses': ['WFImageContentItem'] if sharing else [],
            'WFWorkflowTypes': ['ActionExtension'] if sharing else [],
            'WFWorkflowIcon': {'WFWorkflowIconStartColor': 1232220415, 'WFWorkflowIconGlyphNumber': 59456},
            'WFWorkflowImportQuestions': [], 'WFWorkflowActions': actions}

ocr = action('extracttextfromimage', 'screenshot-ocr', WFImage=token('ExtensionInput'))
packed = action('gettext', 'screenshot-text', WFTextActionText=text_token('YUJOURNAL-INBOX/1\n', output(uid('screenshot-ocr'), 'Text from Image')))
clipboard = action('setclipboard', 'screenshot-clipboard', WFInput=output(uid('screenshot-text'), 'Text'), WFLocalOnly=True)
url = action('url', 'screenshot-url', WFURL=BASE + '#entry=clipboard')
opened = action('openurl', 'screenshot-open', WFInput=output(uid('screenshot-url'), 'URL'))
voice_url = action('url', 'voice-url', WFURL=BASE + '#entry=voice')
voice_open = action('openurl', 'voice-open', WFInput=output(uid('voice-url'), 'URL'))
templates = {'Yujournal-Screenshot': workflow('余记 · 截图记账', [ocr, packed, clipboard, url, opened], True),
             'Yujournal-Voice': workflow('余记 · 本机语音', [voice_url, voice_open])}
folder = ROOT / 'shortcuts' / 'templates'; folder.mkdir(parents=True, exist_ok=True)
for name, data in templates.items():
    path = folder / (name + '.plist'); path.write_bytes(plistlib.dumps(data, sort_keys=False)); print(path)

# Signing accepts the .shortcut extension, not the editable .plist extension.
# Example: copy template.plist to an ignored .artifacts/name.shortcut, then
# shortcuts sign --mode anyone --input .artifacts/name.shortcut --output shortcuts/name.shortcut
