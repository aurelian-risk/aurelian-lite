# Third-Party Software Notices

Aurelian Lite (MIT License, © Aurelian-Risk) is distributed as a single,
self-contained HTML file that inlines the open-source libraries listed below.
Their copyright and permission notices are reproduced here as required by their
respective licenses. Data-source and trademark attributions (MITRE ATT&CK, NIS2,
NIST, on-device models) are in the separate [`NOTICE`](NOTICE) file.

## Bundled at build time (inlined into the distributed `index.html`)

| Package | License | Copyright |
| --- | --- | --- |
| `react`, `react-dom` | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `zustand` | MIT | Copyright (c) 2019 Paul Henschel |
| `js-yaml` | MIT | Copyright (C) 2011-2015 by Vitaly Puzrin |
| `d3-force` | ISC | Copyright 2010-2021 Mike Bostock |

## Loaded at runtime from a public CDN (NOT bundled)

Assisted extraction dynamically imports Transformers.js from a public CDN only
when the user enables it; it is not part of the distributed file.

| Package | License | Copyright |
| --- | --- | --- |
| `@huggingface/transformers` (Transformers.js) | Apache-2.0 | Copyright (c) Hugging Face |

Transformers.js is used under the Apache License, Version 2.0. The full license
text is available at https://www.apache.org/licenses/LICENSE-2.0 and the
project's own `NOTICE` at https://github.com/huggingface/transformers.js .

---

## License texts

### The MIT License (MIT)

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

### ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

### Apache License 2.0 (summary reference)

Transformers.js is licensed under the Apache License, Version 2.0 ("License");
you may not use that component except in compliance with the License. A copy of
the License is available at:

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
