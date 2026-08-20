<div align="center">
  <h1>Aurelian Lite</h1>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MPL--2.0-14b8a6.svg" alt="License: MPL-2.0"></a>
    <img src="https://img.shields.io/badge/runs-100%25%20offline-1f9d55" alt="Runs 100% offline">
    <a href="MATURITY.md"><img src="https://img.shields.io/badge/branch-development-8b5cf6.svg" alt="Branch: development"></a>
  </p>
</div>

> **This is the `development` branch.** It carries everything the released version has, plus
> whatever is currently being built and tested. Those parts are not in a release yet and may
> still change or be withdrawn. What has settled moves to `main` and ships there; the
> [CHANGELOG](CHANGELOG.md) records it when it does.
>
> **What the project is, what it does and what it looks like is described on
> [`main`](https://github.com/aurelian-risk/aurelian-lite/tree/main)** — that is the branch to
> read, and the one to use. For a ready-made build,
> [download `aurelian-lite.html`](https://github.com/aurelian-risk/aurelian-lite/releases/latest/download/aurelian-lite.html).
> There is no release build of this branch: `npm install && npm run build`.

## About Aurelian Risk Manager

Aurelian Lite is the free, open-source, offline companion to **Aurelian Risk Manager** -
*AI-driven cyber risk analysis*.

Aurelian Risk Manager is an enterprise platform that automates the full assessment end to end:
AI agents turn an organisation's documentation and threat intelligence into quantified,
auditable risk analyses on a unified knowledge graph, combining an **EBIOS RM-inspired**
methodology, **MITRE ATT&CK®** technique mapping and **Monte-Carlo** risk quantification
expressed as monetary loss ranges. It is built for organisations meeting NIS2 obligations
without a dedicated security team, and for security teams that want to accelerate and scale
their work.

Where Aurelian Risk Manager automates the analysis, Aurelian Lite gives you the same structure
as a lightweight modelling tool you can run anywhere, entirely on your own machine. Learn more
at **[aurelian-risk.com](https://aurelian-risk.com)**.

## License

[Mozilla Public License 2.0](LICENSE) © Aurelian-Risk

Use it, run it, fork it, sell services around it. Two things are asked in return.

**Changes to these files come back.** MPL-2.0 is copyleft per file: if you modify a
file that carries `SPDX-License-Identifier: MPL-2.0`, that file stays under the MPL
and your modified version has to be available. Code you add in your own files is
yours, under whatever licence you choose - you can build a proprietary product
around this without opening it.

**The built file says where its source is.** If you pass on `index.html`, section 3.2
asks that recipients can find the source it came from; the banner at the top of the
file carries that already.

Bundled reference datasets and the open-source libraries inlined into the build keep
their own licences - see [`NOTICE`](NOTICE) and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). The name is not part of the licence:
see [`TRADEMARK.md`](TRADEMARK.md).

Releases up to and including v0.4.6 were published under the MIT License and remain
MIT for anyone holding them.

## Disclaimer

Aurelian Lite is provided "as is" and "as available", without warranties or conditions of any
kind, whether express, implied or statutory, including but not limited to any implied warranties
of merchantability, fitness for a particular purpose, title, non-infringement, accuracy,
reliability or availability.

- **Not professional advice.** Aurelian Lite is a risk-modelling aid, not professional security,
  legal, regulatory, financial or compliance advice, and is not a substitute for qualified
  expertise or an independent assessment.
- **No guaranteed results.** All outputs, including any suggestions produced by the on-device
  model and any likelihood, severity or risk ratings, may be incomplete, inaccurate or wrong.
  The tool does not detect, identify or quantify all risks, threats, vulnerabilities or scenarios.
  You are responsible for independently reviewing and validating every result before relying on it.
- **No compliance guarantee.** Using Aurelian Lite does not certify, ensure or demonstrate
  conformity with EBIOS RM, ISO/IEC 27005, NIS2 or any other framework, standard or regulation.
- **Your responsibility.** You use Aurelian Lite entirely at your own risk and are solely
  responsible for any decisions, actions, configurations and omissions based on it, and for the
  confidentiality, integrity, backup and lawful processing of any data you enter. Data is kept
  locally in your browser and may be lost (for example by clearing browser data); no
  responsibility is accepted for any such loss.
- **Third-party components.** Models, datasets and libraries obtained from third parties
  (including any downloaded machine-learning model and MITRE ATT&CK content) remain the
  responsibility of their respective owners and are subject to their own terms; no responsibility
  is accepted for third-party content.
- **Limitation of liability.** To the fullest extent permitted by applicable law, the authors,
  contributors and Aurelian-Risk shall not be liable for any direct, indirect, incidental,
  special, consequential, exemplary or punitive damages, nor for any loss of data, profits,
  revenue, business, goodwill or reputation, nor for any other damage or harm of any kind, arising
  out of or in connection with the use of, or inability to use, Aurelian Lite, even if advised of
  the possibility of such damages.

By downloading, building or using Aurelian Lite you acknowledge and accept this disclaimer.
Nothing in it excludes or limits any liability that cannot be excluded or limited under
applicable law.

---

<div align="center">
  <a href="https://aurelian-risk.com"><img src="docs/logo.svg" alt="Aurelian" width="46"></a>
  <br>
  <sub>An open-source project by <a href="https://aurelian-risk.com"><strong>Aurelian-Risk</strong></a></sub>
  <br><br>
  <sub>Aurelian Lite is <strong>inspired by</strong> the EBIOS Risk Manager methodology (published by
  ANSSI) and ISO/IEC 27005. It is an independent tool and is <strong>not certified by or affiliated
  with</strong> ANSSI, ISO, NIST, the EU or MITRE. MITRE ATT&CK® is a trademark of The MITRE
  Corporation. Contains public-sector reference material from the EU (NIS2, EUR-Lex) and NIST;
  see <a href="NOTICE">NOTICE</a> and <a href="THIRD-PARTY-NOTICES.md">THIRD-PARTY-NOTICES.md</a>.</sub>
</div>
