"""
KateLab oracle: an independent Python solver for kinematic chains.

It reads chain JSON files, solves every cluster state with sympy.linsolve over
exact rationals (fractions.Fraction / sympy.Rational) and writes the results.
tests/oracle.test.ts then compares them with TypeScript solvers A and B.

It shares no code with the TypeScript solvers.

Usage:
    python tools/oracle/kinematics.py OUT.json IN1.json [IN2.json ...]

Each input file may be:
  - tests/golden/golden.json        ({"cases": [{"id", "chain"?}, ...]})
  - a fixture                       ({"chain": {...}})          id = file name
  - tests/oracle/random-chains.json ({"chains": [{"id", "chain"}, ...]})
  - a pool file                     ({"exercises": [{"id", "chain"}, ...]} or one exercise {"id", "chain"})
"""
from __future__ import annotations

import itertools
import json
import os
import sys
from fractions import Fraction

import sympy as sp


def frac(x) -> Fraction:
    """Exact parse of "2,5", "3/4", "1440", 12 (no floats)."""
    if isinstance(x, int):
        return Fraction(x)
    s = str(x).strip().replace(",", ".")
    if "/" in s:
        a, b = s.split("/", 1)
        return frac(a) / frac(b)
    return Fraction(s)  # Fraction parses decimal strings exactly


def R(x) -> sp.Rational:
    f = frac(x)
    return sp.Rational(f.numerator, f.denominator)


def fstr(r: sp.Rational) -> str:
    r = sp.Rational(r)
    return str(r.p) if r.q == 1 else f"{r.p}/{r.q}"


def states_of(chain: dict) -> list[dict]:
    clusters = chain.get("clusters", [])
    if not clusters:
        return [{}]
    combos = itertools.product(*[c["options"] for c in clusters])
    return [{c["id"]: opt for c, opt in zip(clusters, combo)} for combo in combos]


def state_key(chain: dict, st: dict) -> str:
    return ",".join(f'{c["id"]}={st.get(c["id"], "?")}' for c in chain.get("clusters", []))


def active(chain: dict, st: dict) -> list[dict]:
    owner = {o: c["id"] for c in chain.get("clusters", []) for o in c["options"]}
    return [e for e in chain["elements"] if e["id"] not in owner or st[owner[e["id"]]] == e["id"]]


def solve_state(chain: dict, st: dict) -> dict:
    els = active(chain, st)
    shafts = [s["id"] for s in chain["shafts"]]
    outs = [l["id"] for l in chain.get("linear", [])]
    n = {s: sp.Symbol(f"n_{i}") for i, s in enumerate(shafts)}      # magnitudes
    w = {s: sp.Symbol(f"w_{i}") for i, s in enumerate(shafts)}      # signed (parallel axes)
    c = {o: sp.Symbol(f"c_{i}") for i, o in enumerate(outs)}        # pi-coefficient of v [mm/min]
    pi_pow: dict[str, int] = {}
    inp = chain["input"]
    n_in = R(inp["n"])

    eq1 = [sp.Eq(n[inp["shaft"]], n_in)]
    eq2 = [sp.Eq(w[inp["shaft"]], n_in)]
    for e in els:
        k = e["kind"]
        a = e["from"]
        if k in ("gear", "bevel", "chain"):
            b = e["to"]
            # pitch-line speed equality: pi*m*z1*n1 = pi*m*z2*n2
            eq1.append(sp.Eq(e["z1"] * n[a], e["z2"] * n[b]))
            if k == "gear":
                s = 1 if e.get("internal") else -1
                eq2.append(sp.Eq(e["z2"] * w[b], s * e["z1"] * w[a]))
            elif k == "chain":
                eq2.append(sp.Eq(e["z2"] * w[b], e["z1"] * w[a]))
        elif k == "belt":
            b = e["to"]
            d1 = R(e["d1"]) * (1 - R(e.get("slip", 0)))
            d2 = R(e["d2"])
            eq1.append(sp.Eq(d1 * n[a], d2 * n[b]))
            s = -1 if e.get("crossed") else 1
            eq2.append(sp.Eq(d2 * w[b], s * d1 * w[a]))
        elif k == "worm":
            b = e["to"]
            # each worm turn advances the wheel by `starts` teeth
            eq1.append(sp.Eq(e["z"] * n[b], e["starts"] * n[a]))
        elif k == "clutch":
            b = e["to"]
            eq1.append(sp.Eq(n[a], n[b]))
            eq2.append(sp.Eq(w[a], w[b]))
        elif k == "rack":
            o = e["output"]
            if pi_pow.setdefault(o, 1) != 1:
                return {"ok": False}
            eq1.append(sp.Eq(c[o], R(e["module"]) * e["z"] * n[a]))
        elif k == "screw":
            o = e["output"]
            if pi_pow.setdefault(o, 0) != 0:
                return {"ok": False}
            eq1.append(sp.Eq(c[o], R(e["pitch"]) * e["starts"] * n[a]))
        else:
            raise ValueError(f"unknown kind {k}")

    vars1 = list(n.values()) + list(c.values())
    sol1 = sp.linsolve(eq1, vars1)
    if sol1 == sp.EmptySet:
        return {"ok": False}
    (t1,) = list(sol1)
    sol2 = sp.linsolve(eq2, list(w.values()))
    if sol2 == sp.EmptySet:
        return {"ok": False}
    (t2,) = list(sol2)

    res_sh = {}
    for i, s in enumerate(shafts):
        v = t1[i]
        if v.free_symbols or v == 0:
            continue  # not driven
        if v < 0:
            return {"ok": False}
        ws = t2[i]
        d = None
        if not ws.free_symbols:
            if ws == 0 or abs(ws) != v:
                return {"ok": False}  # locked by its own gear loop
            d = 1 if ws > 0 else -1
        res_sh[s] = {"n": fstr(v), "dir": d}
    res_lin = {}
    for j, o in enumerate(outs):
        v = t1[len(shafts) + j]
        if v.free_symbols or v == 0:
            continue
        res_lin[o] = {"coef": fstr(abs(v)), "piPower": pi_pow.get(o, 0)}
    return {"ok": True, "shafts": res_sh, "linear": res_lin}


def load_chains(path: str) -> list[tuple[str, dict]]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if "cases" in data:
        return [(c["id"], c["chain"]) for c in data["cases"] if "chain" in c]
    if "chains" in data:
        return [(c["id"], c["chain"]) for c in data["chains"]]
    if "exercises" in data:
        return [(c["id"], c["chain"]) for c in data["exercises"]]
    if "chain" in data and "id" in data:
        return [(data["id"], data["chain"])]
    if "chain" in data:
        return [(os.path.splitext(os.path.basename(path))[0], data["chain"])]
    raise ValueError(f"{path}: unknown format")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    out_path, inputs = argv[1], argv[2:]
    result: dict = {"sympy": sp.__version__, "chains": {}}
    for p in inputs:
        for cid, chain in load_chains(p):
            result["chains"][cid] = {state_key(chain, st): solve_state(chain, st) for st in states_of(chain)}
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1, sort_keys=True)
    print(f"oracle: {len(result['chains'])} chains written to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
