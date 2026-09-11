# What to write next

Take the top unticked chapter in the earliest incomplete wave. One chapter per
session, one chapter per commit.

This outline is **not** CppTB's outline with the names changed. Roughly half of
that book is about decisions Java makes for you — manual memory, RAII, moves,
the compilation model — and Java has as much again that C++ has no chapter for:
the JVM itself, erasure, checked exceptions, the collections framework,
streams, virtual threads. What carries over is the method, not the syllabus.

---

## Wave 0 — the engine ✅ complete

- [x] Port the site engine from CppTB, isolating everything language-specific
      into `build/language.ts` and `server/compile.ts`
- [x] Java grading harness: `check` / `checkEq` / `checkNear` / `checkThrows`,
      with expression text recovered at run time and positions remapped back to
      `your code` and `checks`
- [x] `javac` / `java` / `javap` backend on JDK 21, assertions on, heap capped
- [x] Snippet and problem verifiers, compiling in parallel
- [ ] GitHub Pages deployment: needs Pages enabled on the repo, then the
      workflow's JDK setup step verified in CI

---

## Part 1 — Foundations

The reader has never written Java. By the end of this part they can write, run
and reason about a single-file program.

### Wave A — first programs ✅ complete

- [ ] 1.1 Hello, JVM — source to class file to running program; what `javac`
      and `java` each do, and what "write once, run anywhere" actually buys
- [x] 1.2 Values and variables — the eight primitives, literals, and what
      happens when an `int` runs out of room
- [x] 1.3 Control flow — `if`, loops, and both forms of `switch`
- [x] 1.4 Methods — parameters, returns, overloading, and why Java passes
      everything by value
- [x] 1.5 Arrays — fixed length, bounds checking, and the `Arrays` utilities
- [x] 1.6 Strings — immutability, the pool, `==` versus `equals`,
      `StringBuilder`, text blocks
- [x] 1.7 Input and output — `Scanner`, `BufferedReader`, `printf`

## Part 2 — Objects

### Wave B — modelling with classes ✅ complete

- [x] 2.1 Classes and objects — fields, constructors, `this`
- [x] 2.2 Aliasing — when sharing an object goes wrong, and defensive copying
      *(retitled from "References — what a variable actually holds; aliasing".
      1.4 already teaches that a variable holds an arrow and that a method gets
      a copy of it, and 2.1 closes on two names for one book. A third pass over
      the same ground would teach nothing, so this chapter is the consequence
      instead: references escaping through constructors and getters, defensive
      copies, and immutability as the alternative to copying.)*
- [x] 2.3 Encapsulation — access modifiers as a tool for keeping invariants
- [x] 2.4 `equals`, `hashCode`, `toString` — the contracts, and what breaks
      when you honour one and not the other
- [x] 2.5 Inheritance — `extends`, `super`, and overriding
- [x] 2.6 Polymorphism — what happens at the call site, and what it costs
- [x] 2.7 Interfaces — including default methods and why they exist
- [x] 2.8 Abstract classes — and choosing between the two
- [x] 2.9 Records — the right answer more often than a class
- [x] 2.10 Enums — constants with behaviour
- [x] 2.11 Sealed types and pattern matching — modelling a closed set
- [x] 2.12 Nested, inner and anonymous classes — and the reference an inner
      class quietly holds

## Part 3 — When things go wrong

### Wave C — failure as a design problem ✅ complete

- [x] 3.1 Exceptions — `throw`, `catch`, `finally`, and the stack trace
- [x] 3.2 Checked versus unchecked — the argument, and where each belongs
- [x] 3.3 `try`-with-resources and `AutoCloseable`
- [x] 3.4 `null` and `Optional` — the billion-dollar mistake, and the API that
      does not quite undo it
- [x] 3.5 Designing failure — exception, `Optional`, or a result type

## Part 4 — Collections

### Wave D — the library you actually use ✅ complete

- [x] 4.1 The collections framework — the shape of the hierarchy
- [x] 4.2 `List` — `ArrayList` versus `LinkedList`, measured
- [x] 4.3 `Map` — how `HashMap` really stores things, load factor, treeification
- [x] 4.4 `Set` and ordering — `Comparable`, `Comparator`, `TreeMap`
- [x] 4.5 Queues and deques — `ArrayDeque`, `PriorityQueue`
- [x] 4.6 Iteration — iterators, `ConcurrentModificationException`, safe removal
- [x] 4.7 Immutable collections in practice — shallow immutability, and the
      order the JDK deliberately scrambles
      *(retitled from "Immutable and unmodifiable collections — and the
      difference". 4.1 already contrasts List.of, Arrays.asList,
      unmodifiableList and copyOf in one sample, so the taxonomy is taught. This
      chapter is what 4.1 left: an immutable collection of mutable elements,
      the per-JVM salting of Set.of and Map.of iteration order, null hostility
      as a design decision, and where a copy is free. 2.2 is the precedent.)*

## Part 5 — Generics

### Wave E — types that take types ✅ complete

- [x] 5.1 Generic classes and methods
- [x] 5.2 Erasure — what survives to run time, and what does not
- [x] 5.3 Wildcards — `? extends`, `? super`, and when each reads right
- [x] 5.4 The limits — no generic arrays, no primitives, and the workarounds

## Part 6 — Functional Java

### Wave F — code as a value ✅ complete

- [x] 6.1 Lambdas and functional interfaces
- [x] 6.2 Method references
- [x] 6.3 Streams — the pipeline, and laziness
- [x] 6.4 Collectors — including the ones worth writing yourself
- [x] 6.5 When a loop is the better answer

## Part 7 — The platform

### Wave G — what runs your program ✅ complete

- [x] 7.1 Object lifetime and garbage collection
- [x] 7.2 Stack, heap, and escape — where an object actually lives
- [x] 7.3 Class loading and initialisation order
- [x] 7.4 Reflection and annotations
- [x] 7.5 The classpath and the module system
- [x] 7.6 Files and NIO
- [x] 7.7 `java.time` — the API that finally got dates right

## Part 8 — Concurrency

### Wave H — more than one thread ✅ complete

- [x] 8.1 Threads, and why shared mutable state is the whole problem
- [x] 8.2 The memory model — `synchronized`, `volatile`, happens-before
- [x] 8.3 Executors and futures
- [x] 8.4 Concurrent collections
- [x] 8.5 Virtual threads
      *(Retitled from "Virtual threads and structured concurrency":
      `StructuredTaskScope` is a preview API in Java 21 and will not compile
      without `--enable-preview`, so nothing about it can be verified. The
      chapter shows its shape in a non-runnable sketch and gives the working
      equivalent. 2.2 is the precedent.)*
- [x] 8.6 Parallel streams — and the cases where they lose

## Part 9 — Engineering

### Wave I — code other people rely on ✅ complete

- [x] 9.1 Testing — and what a test framework actually does
      *(Retitled from "Testing with JUnit": the runner compiles a single file
      with no third-party classpath, so no JUnit code can be verified. The
      chapter builds a working mini-framework — reusing 7.4's annotation
      runner — and shows real JUnit 5 alongside it in clearly-marked
      non-runnable blocks. 8.5 is the precedent.)*
- [x] 9.2 Build tools — what Maven and Gradle are actually doing
- [x] 9.3 Debugging and reading a stack trace properly
- [x] 9.4 Measuring performance without lying to yourself — warmup, JMH
- [x] 9.5 API design in Java
- [x] 9.6 Packaging and shipping

## Maintenance mode — one item a morning

Parts 1 to 9 are complete, so this book and **CppTB** are now maintained
together, slowly. One item per morning run, finished and verified, rather than
a chapter a session.

Take the top unticked item. Add to the bottom when something turns up.

- [x] **Plan Part 10 properly.** Done 2026-09-12: the forty chapters are below,
      wave by wave, with the Java-specific note recorded wherever the chapter
      diverges from CppTB's. No engine work was needed — Wave 0 inherited it.
- [ ] Fix two stale boxes in this file: 1.1 "Hello, JVM" is written and complete
      but unticked, and Wave 0's Pages-deployment box predates the live site.
- [ ] Audit chapters 1.1–1.7 against the voice and template the later chapters
      settled into. They were written first and are the least consistent.
- [ ] `/reference/` and `/progress/` render from front-matter objectives —
      check every chapter has them and that none is a blank row.
- [ ] Resolve forward references now that their targets exist: grep the content
      for "chapter N.M will" and link or reword.
- [ ] Count the problems per chapter and add a third to any that would carry
      one — the early parts are the likely candidates.

## Part 10 — Problem solving and algorithms

Planned 2026-09-12. Forty chapters, eight waves of five, mirroring CppTB's Part
10. Read this section before starting the part; the decisions below are settled.

**What ports and what does not.** The *structure* ports — the same waves in the
same order, because the dependency graph between techniques is a property of the
techniques, not of the language. The *content* does not port by copy-paste. Five
differences drive every Java-specific note below:

1. **Boxing has a price, and it is paid in memory as well as time.** An
   `Integer` is an object with a header; a `HashMap<Integer, Integer>` of a
   million entries is nothing like an `int[1_000_000]`. The runner gives 512 MB.
2. **Arrays of arrays are not a rectangle.** `int[n][m]` is `n` separate objects
   reached by a pointer hop, so traversal order and allocation both matter in a
   way `std::vector` flattening does not.
3. **The stack is small and the failure is loud.** `-Xss8m`, and deep recursion
   raises `StackOverflowError` rather than quietly corrupting anything. Several
   chapters must teach the iterative form as the *primary* one.
4. **Signed overflow is defined.** Java wraps two's-complement where C++ has
   undefined behaviour, so the CppTB chapters' sanitizer demonstrations have no
   Java counterpart — the demonstration becomes "it silently gives the wrong
   answer", which needs different prose.
5. **Measurement needs warmup.** Every timing claim runs on a JIT, so it needs
   warmup and a consumed result. That rule already exists in `AUTHORING.md`; in
   this part it applies to nearly every chapter.

**Decision 1 — every chapter carries two kinds of problem**, as in CppTB:
2 function-style (`check: unit`) that isolate the technique, and 2–3 judge-style
(`check: output`) that drill it against fixed cases with stated constraints.

**Decision 2 — the scope is forty chapters.** No filler: if a chapter cannot
justify five problems that each teach something different, merge it with its
neighbour.

### Engine work — none needed ✅

CppTB had to build judge problems before its Part 10 could start. This book
inherited the finished engine in Wave 0, so the work is already done: `JudgeCase`
and a `## Cases` section (`build/types.ts`), per-case `timeLimitMs` clamped to
the server's limit, and `scripts/verify-exercises.ts` running every case for both
solution and starter. `docs/AUTHORING.md` documents all of it, including the
Java-specific sizing note — every case pays a JVM start on top of a recompile, so
four to six sub-second cases, not six of a second each.

Do not re-do this. Confirm it still passes and start writing 10.1.

### Wave A — foundations of problem solving

- [ ] 10.1 How to read a problem and its limits
- [ ] 10.2 Counting the work you actually do — and measuring it on a JIT
      *(retitled from CppTB's 10.2: warmup, dead-code elimination and a consumed
      result are not a footnote here, they are half the chapter. A reader who
      times a cold loop measures the interpreter.)*
- [ ] 10.3 The contest template and fast I/O — `Scanner` against
      `BufferedReader` and `StreamTokenizer`, one `StringBuilder` for output,
      and why flushing per line costs more than the algorithm
- [ ] 10.4 Sorting, comparators, and coordinate compression — the split that has
      no C++ counterpart: `Arrays.sort(int[])` is dual-pivot quicksort and has
      an adversarial worst case, `Arrays.sort(T[])` is TimSort and does not.
      Shuffle-then-sort, and the comparator contract TimSort actually enforces
- [ ] 10.5 Binary search: on a range, and on the answer — the insertion-point
      encoding `Arrays.binarySearch` returns, and `(lo + hi) >>> 1`

### Wave B — sequences

- [ ] 10.6 Two pointers and sliding windows
- [ ] 10.7 Prefix sums and difference arrays — `long[]`, and where the sum of
      `int`s stops fitting in an `int`
- [ ] 10.8 Monotonic stacks — `ArrayDeque`, and why `Stack` is a synchronised
      `Vector` nobody should reach for
- [ ] 10.9 Deques and sliding-window extrema
- [ ] 10.10 Frequency maps without boxing: primitives, hashing, and multisets
      *(retitled from CppTB's "Hashing, frequency maps, and multisets". The
      boxing cost of `HashMap<Integer, Integer>` and the primitive-array
      alternative is the spine of this chapter, not an aside — and it is what
      10.16, 10.27 and 10.31 lean on. Covers `merge`/`getOrDefault`, `TreeMap`
      as a multiset, and the collision behaviour of `Integer` keys.)*

### Wave C — search and greedy

- [ ] 10.11 Recursion and backtracking — the depth `-Xss8m` actually affords,
      measured, and the shape of the iterative rewrite
- [ ] 10.12 Bitmasks: enumerating subsets and permutations — `Integer.bitCount`,
      `numberOfTrailingZeros`, `>>>`, and submask enumeration. Java ships the
      intrinsics C++ waited until C++20 for
- [ ] 10.13 Greedy, and proving it with an exchange argument
- [ ] 10.14 Divide and conquer
- [ ] 10.15 Meet in the middle — where 2²⁰ longs sits against a 512 MB heap

### Wave D — graphs

- [ ] 10.16 Representing graphs — a full chapter here, not a short one:
      `List<List<Integer>>` boxes every vertex id and scatters the adjacency
      across the heap, and the `int[] head, next, to` form does not. Measured
      side by side, this is the largest constant-factor lesson in the part
- [ ] 10.17 BFS, 0–1 BFS, and multi-source BFS
- [ ] 10.18 DFS: components, cycles, bridges — **iterative first.** A recursive
      DFS over a path graph of 10⁵ vertices overflows the stack, so the explicit
      stack is the version that ships and recursion is the sketch
- [ ] 10.19 Topological order and DAG DP
- [ ] 10.20 Union-Find

### Wave E — shortest paths and trees

- [ ] 10.21 Dijkstra — `PriorityQueue` has no decrease-key and its
      `remove(Object)` is O(n); push duplicates and skip stale pops, or encode
      `(dist, node)` into one `long`
- [ ] 10.22 Bellman–Ford and Floyd–Warshall — where the array-of-arrays layout
      shows up in the innermost loop, and which index order pays for it
- [ ] 10.23 Minimum spanning trees
- [ ] 10.24 Tree DP and rerooting — iterative post-order, for the reason in 10.18
- [ ] 10.25 LCA, binary lifting, and Euler tours

### Wave F — dynamic programming

- [ ] 10.26 DP: state, transition, order
- [ ] 10.27 Knapsack and coin change — rolling `int[]` rows, and the memory
      arithmetic that decides whether the 2-D table fits at all
- [ ] 10.28 LIS, LCS, and edit distance
- [ ] 10.29 Interval DP
- [ ] 10.30 Bitmask DP

### Wave G — data structures

- [ ] 10.31 Fenwick trees
- [ ] 10.32 Segment trees — array-backed. A node-per-object tree is the natural
      Java reflex and is the slow one; show both and measure
- [ ] 10.33 Lazy propagation
- [ ] 10.34 Sparse tables and RMQ
- [ ] 10.35 Heavy-light and centroid decomposition

### Wave H — maths, strings, geometry, flows

- [ ] 10.36 Number theory: gcd, sieve, modular arithmetic — `Math.floorMod`
      against `%`, and mulmod without a 128-bit type (`Math.multiplyHigh`)
- [ ] 10.37 Combinatorics, inclusion–exclusion, matrix exponentiation —
      `BigInteger` is in the standard library, which changes what this chapter
      can assume relative to CppTB's
- [ ] 10.38 String matching: KMP, Z, and hashing — `char[]` against `String`,
      and the fact that `substring` copies
- [ ] 10.39 Computational geometry — exact `long` arithmetic first, `double`
      only where it must be; there is no `long double` to hide behind
- [ ] 10.40 Max flow, min cut, and matching

### The stretch shelf

Only once all forty are written, and only if the author still wants them:
suffix automata and suffix arrays · FFT and NTT · persistent segment trees ·
digit DP · convex hull trick · Sprague–Grundy · Mo's algorithm.

### Rules specific to this part

- **A technique is not taught until a program demonstrates it failing without
  it.** Show the quadratic version timing out before showing the prefix sum.
- **Every judge problem states its constraints**, and they must be the ones that
  make the intended solution necessary.
- **A timing claim without warmup is not a measurement.** See 10.2; this is the
  rule most likely to be broken by accident in this part.
- **Prefer the primitive form in shipped code**, and show the boxed one when the
  point is the comparison. A reader who learns `List<Integer>` graphs here will
  write them for years.

---

## Standing work

- Add problems to any chapter that has fewer than two.
- Add `:::memviz` diagrams wherever two variables point at one object — that
  picture is this book's single most useful widget.
- Resolve forward references once their targets exist.
