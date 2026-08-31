"""Route a component's visible strings through t(key, authored).

Only two shapes, both unambiguous:
  >Some text<                       JSX text between tags
  title="..." placeholder="..." aria-label="..."

Everything else is left alone deliberately: a string inside an expression can be a
className, an id, a route or a comparison, and getting one of those wrong is silent.
"""
import re, sys, pathlib

ATTRS = ("title", "placeholder", "aria-label")

def slug(text, used):
    """One key per TEXT, not per occurrence.

    The same sentence in three places must share one key, or a translator writes it three
    times and the three drift apart the moment one is corrected — and under the lookup rule
    a stale translation does not fail, it simply shows. Only genuinely different texts that
    happen to slug the same get a numbered suffix.
    """
    if text in used:
        return used[text]
    w = re.findall(r"[A-Za-z]+", text.lower())[:4]
    base = "-".join(w) or "text"
    taken = set(used.values())
    k, n = base, 2
    while k in taken:
        k, n = f"{base}-{n}", n + 1
    used[text] = k
    return k

def run(path, area, apply=True):
    src = pathlib.Path(path).read_text()
    out, used, changed = src, {}, []

    def jsx(m):
        text = m.group(1)
        if not re.search(r"[A-Za-z]{2}", text) or "{" in text or "}" in text:
            return m.group(0)
        stripped = text.strip()
        if len(stripped) < 2 or not stripped[0].isupper():
            return m.group(0)
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()) :]
        key = f"ui.{area}.{slug(stripped, used)}"
        changed.append((stripped, key))
        return f">{lead}{{tr({key!r}, {stripped!r})}}{trail}<"

    # The `<` that follows has to open a TAG. Without this the pattern also matches a
    # TypeScript generic — `new Map<string, Node>()` reads as ">…<" with prose between —
    # and rewriting one of those is a syntax error at best and silent at worst.
    out = re.sub(r">([^<>{}]{2,})<(?=/?[A-Za-z][A-Za-z0-9.]*[\s/>])", jsx, out)

    def attr(m):
        name, text = m.group(1), m.group(2)
        if len(text) < 3 or not text[0].isupper():
            return m.group(0)
        key = f"ui.{area}.{slug(text, used)}"
        changed.append((text, key))
        return f'{name}={{tr({key!r}, {text!r})}}'

    out = re.sub(r'\b(' + "|".join(ATTRS) + r')="([^"]{3,})"', attr, out)

    if apply and out != src:
        if 'from "../domain/i18n"' not in out and 'from "./domain/i18n"' not in out:
            rel = "./domain/i18n" if "/src/App" in path or path.endswith("src/App.tsx") else "../domain/i18n"
            first = re.search(r"^import .*$", out, re.M)
            out = out[: first.end() + 1] + f'import {{ t as tr }} from "{rel}";\n' + out[first.end() + 1 :]
        pathlib.Path(path).write_text(out)
    return changed

if __name__ == "__main__":
    path, area = sys.argv[1], sys.argv[2]
    for text, key in run(path, area):
        print(f"  {key:<44} {text[:52]}")
