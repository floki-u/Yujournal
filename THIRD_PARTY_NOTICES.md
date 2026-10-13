# Third-party notices

Project code/docs/artwork use MIT; third-party licenses are retained, not replaced by the root license.

| Component                   | Version/source                                                                                                     | License/notice                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Tesseract.js                | 6.0.1, [upstream](https://github.com/naptha/tesseract.js)                                                          | Apache-2.0; `vendor/ocr/licenses/TESSERACT-JS-LICENSE.md`    |
| Tesseract.js core           | 6.0.0, [upstream](https://github.com/naptha/tesseract.js-core)                                                     | Apache-2.0; `vendor/ocr/licenses/TESSERACT-CORE-LICENSE.txt` |
| Fast Chinese/English models | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), commit `87416418657359cb625c412a48b6e1d6d41c29bd` | Apache-2.0; `vendor/ocr/licenses/TESSDATA-FAST-LICENSE.txt`  |
| Pixelify Sans               | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/pixelifysans)                                         | SIL OFL 1.1; `fonts/OFL.txt`                                 |

Bundle dependencies' MIT/BSD notices remain in `.LICENSE.txt` and `vendor/ocr/licenses/`. `resource-manifest.json` records sources, versions, sizes and SHA-256. Models are losslessly gzip-compressed; only two LSTM cores ship because OCR uses OEM 1.

Project illustrations were created using OpenAI image-generation tools during design and optimized for web use. They are not stock images or third-party characters, and are included under MIT. System fonts are referenced on-device, not redistributed; Pixelify Sans is the only bundled font.
