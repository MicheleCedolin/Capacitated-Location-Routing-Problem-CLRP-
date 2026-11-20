"""Check the distance rule of the P set against published solutions.

Usage: python3 tests/rounding_check.py "<path to the 'solutions/set P' folder of https://github.com/INFORMSJoC/2023.0416>"
For every solution file it recomputes the cost from data/instances/<name>.dat with three rules
(x100 then ceil, floor, round) and compares it with the objective written in the file.
"""
import sys, os, re, math, glob

def read_dat(p):
    L = [l.split() for l in open(p).read().split('\n') if l.strip()]
    n, m = int(L[0][0]), int(L[1][0]); k = 2
    dep = [tuple(map(float, x)) for x in L[k:k + m]]; k += m
    cus = [tuple(map(float, x)) for x in L[k:k + n]]; k += n
    k += 1 + m + n                                  # vehicle capacity, depot capacities, demands
    fo = [float(L[k + i][0]) for i in range(m)]; k += m
    return dep, cus, fo, float(L[k][0])

def read_sol(p):
    t = open(p).read().split('\n'); obj = float(t[1]); d = None; routes = []
    for l in t:
        a = re.match(r'\s*Location:\s*(\d+)', l); b = re.match(r'\s*Route\s+\d+\(load:\s*\d+\)\s*(.*)', l)
        if a: d = int(a.group(1))
        elif b and b.group(1).split(): routes.append((d, [int(x) for x in b.group(1).split()]))
    return obj, routes

def cost(dep, cus, fo, F, routes, f, off):
    tot = sum(fo[d] for d in {d for d, _ in routes}) + F * len(routes)
    for d, c in routes:
        pts = [dep[d]] + [cus[j - off] for j in c] + [dep[d]]
        tot += sum(f(100 * math.dist(a, b)) for a, b in zip(pts, pts[1:]))
    return tot

if __name__ == '__main__':
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'instances')
    rules = {'ceil': math.ceil, 'floor': math.floor, 'round': lambda x: math.floor(x + 0.5)}
    ok = {k: 0 for k in rules}; n = 0; bad = []
    names = {os.path.basename(f)[:-4].replace('-', ''): f for f in glob.glob(os.path.join(here, '*.dat'))}   # the archive writes coord2051 for coord20-5-1
    for p in sorted(glob.glob(os.path.join(sys.argv[1], '*.txt'))):
        name = os.path.basename(p)[:-4]; q = names.get(name.replace('-', ''))
        if not q: print('no instance file for', name); continue
        dep, cus, fo, F = read_dat(q); obj, routes = read_sol(p); n += 1
        off = 0 if min(j for _, c in routes for j in c) == 0 else 1
        got = {k: cost(dep, cus, fo, F, routes, f, off) for k, f in rules.items()}
        for k in rules: ok[k] += abs(got[k] - obj) < 0.5
        if abs(got['ceil'] - obj) >= 0.5: bad.append((name, obj, got))
        print(f"{name:20s} file {obj:9.0f}  ceil {got['ceil']:9.0f}  floor {got['floor']:9.0f}  round {got['round']:9.0f}  customers {sum(len(c) for _, c in routes)}")
    print('instances checked:', n, '| matches:', ok); print('ceil mismatches:', bad)
    sys.exit(0 if n and ok['ceil'] == n else 1)
