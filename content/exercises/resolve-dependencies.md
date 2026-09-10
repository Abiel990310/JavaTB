---
id: resolve-dependencies
title: "Resolve the graph"
difficulty: core
chapter: build-tools
topics: [build-tools, dependency-resolution, versions, graphs]
check: unit
standard: java21
---

Write the part of a build tool that decides which versions you get.

- `record Coordinate(String name, String version) {}`
- `static int compareVersions(String a, String b)` — segment by segment,
  numerically, missing segments treated as 0; negative, zero or positive
- `static Map<String, String> nearestWins(Map<String, List<Coordinate>> graph, Coordinate root)`
  — Maven's rule: for each library, the version declared at the smallest depth
  from the root wins; on a tie, the one reached first in breadth-first order.
  Returns name to version, and the root itself is not included.
- `static Map<String, String> highestWins(Map<String, List<Coordinate>> graph, Coordinate root)`
  — Gradle's rule: the highest version anyone requested
- `static List<String> conflicts(Map<String, List<Coordinate>> graph, Coordinate root)`
  — the names of libraries requested at more than one version, sorted
- `static boolean agree(Map<String, List<Coordinate>> graph, Coordinate root)` —
  whether the two strategies produce the same result

A graph maps `"name:version"` to the list of coordinates that node depends on.
A node missing from the map has no dependencies. The graph may contain cycles.

## Starter
```java
record Coordinate(String name, String version) {}

static String keyOf(Coordinate coordinate) {
    return coordinate.name() + ":" + coordinate.version();
}

static int compareVersions(String a, String b) {
    return a.compareTo(b);
}

static Map<String, String> nearestWins(Map<String, List<Coordinate>> graph, Coordinate root) {
    Map<String, String> chosen = new HashMap<>();
    for (Coordinate dependency : graph.getOrDefault(keyOf(root), List.of())) {
        chosen.put(dependency.name(), dependency.version());
    }
    return chosen;
}

static Map<String, String> highestWins(Map<String, List<Coordinate>> graph, Coordinate root) {
    return nearestWins(graph, root);
}

static List<String> conflicts(Map<String, List<Coordinate>> graph, Coordinate root) {
    return List.of();
}

static boolean agree(Map<String, List<Coordinate>> graph, Coordinate root) {
    return true;
}
```

## Tests
```java
check(compareVersions("1.0", "1.0") == 0);
check(compareVersions("1.10", "1.9") > 0);
check(compareVersions("1.9", "1.10") < 0);
check(compareVersions("2.0", "1.99.99") > 0);
check(compareVersions("1.0", "1.0.0") == 0);
check(compareVersions("1.0.1", "1.0") > 0);
check(compareVersions("0.9", "1.0") < 0);

Coordinate app = new Coordinate("app", "1.0");

// The chapter's graph: app -> web:2.0, json:1.0 ; web:2.0 -> json:3.0
Map<String, List<Coordinate>> simple = Map.of(
    "app:1.0", List.of(new Coordinate("web", "2.0"), new Coordinate("json", "1.0")),
    "web:2.0", List.of(new Coordinate("json", "3.0")));

checkEq(nearestWins(simple, app), Map.of("web", "2.0", "json", "1.0"));
checkEq(highestWins(simple, app), Map.of("web", "2.0", "json", "3.0"));
checkEq(conflicts(simple, app), List.of("json"));
check(!agree(simple, app));

// Deeper: the nearest declaration is not the first one encountered.
Map<String, List<Coordinate>> deep = Map.of(
    "app:1.0", List.of(new Coordinate("a", "1.0"), new Coordinate("z", "5.0")),
    "a:1.0",   List.of(new Coordinate("b", "1.0")),
    "b:1.0",   List.of(new Coordinate("z", "9.0")));

checkEq(nearestWins(deep, app), Map.of("a", "1.0", "z", "5.0", "b", "1.0"));
checkEq(highestWins(deep, app), Map.of("a", "1.0", "z", "9.0", "b", "1.0"));
checkEq(conflicts(deep, app), List.of("z"));

// No conflict at all: the two strategies agree.
Map<String, List<Coordinate>> clean = Map.of(
    "app:1.0", List.of(new Coordinate("a", "1.0")),
    "a:1.0",   List.of(new Coordinate("b", "2.0")));
checkEq(nearestWins(clean, app), Map.of("a", "1.0", "b", "2.0"));
checkEq(highestWins(clean, app), Map.of("a", "1.0", "b", "2.0"));
checkEq(conflicts(clean, app), List.of());
check(agree(clean, app));

// A cycle must not hang.
Map<String, List<Coordinate>> cyclic = Map.of(
    "app:1.0", List.of(new Coordinate("x", "1.0")),
    "x:1.0",   List.of(new Coordinate("y", "1.0")),
    "y:1.0",   List.of(new Coordinate("x", "1.0")));
checkEq(nearestWins(cyclic, app), Map.of("x", "1.0", "y", "1.0"));
check(agree(cyclic, app));

// Several conflicts, reported in order.
Map<String, List<Coordinate>> many = Map.of(
    "app:1.0", List.of(new Coordinate("p", "1.0"), new Coordinate("q", "1.0")),
    "p:1.0",   List.of(new Coordinate("q", "2.0"), new Coordinate("r", "1.0")),
    "q:1.0",   List.of(new Coordinate("r", "3.0")));
checkEq(conflicts(many, app), List.of("q", "r"));
checkEq(nearestWins(many, app).get("q"), "1.0");
checkEq(highestWins(many, app).get("q"), "2.0");

// An empty graph resolves to nothing.
checkEq(nearestWins(Map.of(), app), Map.of());
checkEq(conflicts(Map.of(), app), List.of());
check(agree(Map.of(), app));
```

## Hints
- `compareTo` on version strings is wrong the moment a segment reaches ten;
  split on `"\\."` and compare each segment as an `int`.
- Both strategies are a breadth-first walk from the root. Only the rule for
  keeping a version differs.
- "Visited" must be keyed on `name:version`, not on `name` — otherwise
  reaching a library at a second version stops the walk before its own
  dependencies are seen. Keying it that way is also what stops the cycle.
- `nearestWins` needs the depth at which each name was first chosen, so keep a
  second map from name to depth and only replace on a strictly smaller one.
- `conflicts` needs every requested version, so collect a
  `Map<String, Set<String>>` while walking and keep the names with more than
  one.
- `agree` is `nearestWins(...).equals(highestWins(...))`.

## Solution
```java
record Coordinate(String name, String version) {}

static String keyOf(Coordinate coordinate) {
    return coordinate.name() + ":" + coordinate.version();
}

static int compareVersions(String a, String b) {
    String[] left = a.split("\\.");
    String[] right = b.split("\\.");
    for (int i = 0; i < Math.max(left.length, right.length); i++) {
        int x = i < left.length ? Integer.parseInt(left[i]) : 0;
        int y = i < right.length ? Integer.parseInt(right[i]) : 0;
        if (x != y) {
            return Integer.compare(x, y);
        }
    }
    return 0;
}

record Visit(Coordinate coordinate, int depth) {}

static List<Visit> walk(Map<String, List<Coordinate>> graph, Coordinate root) {
    List<Visit> visits = new ArrayList<>();
    Deque<Visit> queue = new ArrayDeque<>();
    Set<String> seen = new HashSet<>();
    queue.add(new Visit(root, 0));
    seen.add(keyOf(root));

    while (!queue.isEmpty()) {
        Visit current = queue.poll();
        for (Coordinate dependency : graph.getOrDefault(keyOf(current.coordinate()), List.of())) {
            visits.add(new Visit(dependency, current.depth() + 1));
            if (seen.add(keyOf(dependency))) {
                queue.add(new Visit(dependency, current.depth() + 1));
            }
        }
    }
    return visits;
}

static Map<String, String> nearestWins(Map<String, List<Coordinate>> graph, Coordinate root) {
    Map<String, String> chosen = new HashMap<>();
    Map<String, Integer> depthOf = new HashMap<>();
    for (Visit visit : walk(graph, root)) {
        String name = visit.coordinate().name();
        Integer known = depthOf.get(name);
        if (known == null || visit.depth() < known) {
            depthOf.put(name, visit.depth());
            chosen.put(name, visit.coordinate().version());
        }
    }
    return Map.copyOf(chosen);
}

static Map<String, String> highestWins(Map<String, List<Coordinate>> graph, Coordinate root) {
    Map<String, String> chosen = new HashMap<>();
    for (Visit visit : walk(graph, root)) {
        String name = visit.coordinate().name();
        String current = chosen.get(name);
        if (current == null || compareVersions(visit.coordinate().version(), current) > 0) {
            chosen.put(name, visit.coordinate().version());
        }
    }
    return Map.copyOf(chosen);
}

static List<String> conflicts(Map<String, List<Coordinate>> graph, Coordinate root) {
    Map<String, Set<String>> versions = new TreeMap<>();
    for (Visit visit : walk(graph, root)) {
        versions.computeIfAbsent(visit.coordinate().name(), key -> new HashSet<>())
            .add(visit.coordinate().version());
    }
    List<String> conflicted = new ArrayList<>();
    versions.forEach((name, seen) -> {
        if (seen.size() > 1) {
            conflicted.add(name);
        }
    });
    return List.copyOf(conflicted);
}

static boolean agree(Map<String, List<Coordinate>> graph, Coordinate root) {
    return nearestWins(graph, root).equals(highestWins(graph, root));
}
```

## Notes
The starter looks only at the root's direct dependencies, which is the whole
point: **transitive** resolution is the job. `app` in the `deep` graph declares
two things and resolves four, and no amount of reading the root tells you that.

Three details decide whether the walk is right.

**Visit every declaration, enqueue each node once.** The `walk` helper records
*every* edge it sees — that is what `conflicts` needs — but only enqueues a
`name:version` it has not already expanded. Keying the visited set on the
coordinate rather than the name matters twice: it terminates the cycle in the
`cyclic` graph, and it still lets `json:1.0` and `json:3.0` both be recorded so
the conflict is visible. Key it on the name alone and the second version is
silently dropped, which is a resolver that never reports a conflict.

**Breadth-first, and depth compared strictly.** `nearestWins` replaces a choice
only when a *strictly smaller* depth appears, so the first declaration at the
winning depth is kept — Maven's tie-break. The `deep` graph is the case that
catches a depth-first walk: `z:9.0` sits three levels down under `a`, and
`z:5.0` sits one level down beside it, so a resolver that walks `a` to the
bottom before looking at `z` will meet `9.0` first and keep it.

**Numeric version comparison.** `compareTo` gets every test above right except
the ones with a two-digit segment, which is exactly how this bug ships: it is
correct for the first nine releases of everything.

The last thing worth noticing is what `agree` measures. On a graph with no
conflict the two strategies are identical, so the choice of build tool is
invisible — which is why most projects never think about it. It becomes visible
exactly when two libraries disagree, and then the two tools give you different
classpaths from the same declarations. `mvn dependency:tree` and
`gradle dependencies` print the version each one chose *and* the ones it
rejected, which is the output this exercise reproduces in miniature.
