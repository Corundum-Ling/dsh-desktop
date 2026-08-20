# Third-Party Notices

DeepSeek Harness Desktop distributes third-party software. Each component remains subject to its own license and copyright notices.

## Bundled runtime components

| Component | Bundled version | License | Source |
|---|---:|---|---|
| DeepSeek Harness (`@deepseek-ai/dsh`) | `0.1.0-rc.8` | MIT | <https://github.com/deepseek-ai/deepseek-harness> |
| Node.js | `24.4.0` | MIT and bundled third-party licenses | <https://github.com/nodejs/node> |
| pnpm executable | `10.8.0` | MIT | <https://github.com/pnpm/pnpm> |
| Node.js runtime embedded in the pnpm standalone executable | `20.11.1` | MIT and bundled third-party licenses | <https://github.com/nodejs/node> |
| Electron | `43.4.0` | MIT and bundled Chromium/third-party licenses | <https://github.com/electron/electron> |

The installed application also contains transitive packages required by DeepSeek Harness and Electron. Their package metadata and license files are included where provided by their distributions.

The complete license material for the bundled Node.js runtime, the Node.js runtime embedded in pnpm's standalone executable, and pnpm is installed under `resources/resources/licenses/` as `node-LICENSE.txt`, `pnpm-embedded-node-LICENSE.txt`, and `pnpm-LICENSE.txt`. Electron's distribution includes its own `LICENSE.electron.txt` and `LICENSES.chromium.html` files. These materials remain authoritative if a summary in this notice differs from an upstream license text.

## DeepSeek Harness MIT notice

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Electron MIT notice

```text
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Node.js and Electron include additional third-party license notices in their upstream distributions. Before redistributing a release, review the license material under `dist/win-unpacked/resources/resources/licenses`, Electron's generated license files, and the dependency metadata under the prepared `resources/dsh` tree.

The DeepSeek name and whale mark are used only to identify the upstream software wrapped by this project. No official partnership, endorsement, or support is implied.
