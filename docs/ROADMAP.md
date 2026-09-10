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

### Wave G — what runs your program

- [x] 7.1 Object lifetime and garbage collection
- [x] 7.2 Stack, heap, and escape — where an object actually lives
- [ ] 7.3 Class loading and initialisation order
- [ ] 7.4 Reflection and annotations
- [ ] 7.5 The classpath and the module system
- [ ] 7.6 Files and NIO
- [ ] 7.7 `java.time` — the API that finally got dates right

## Part 8 — Concurrency

### Wave H — more than one thread

- [ ] 8.1 Threads, and why shared mutable state is the whole problem
- [ ] 8.2 The memory model — `synchronized`, `volatile`, happens-before
- [ ] 8.3 Executors and futures
- [ ] 8.4 Concurrent collections
- [ ] 8.5 Virtual threads and structured concurrency
- [ ] 8.6 Parallel streams — and the cases where they lose

## Part 9 — Engineering

### Wave I — code other people rely on

- [ ] 9.1 Testing with JUnit
- [ ] 9.2 Build tools — what Maven and Gradle are actually doing
- [ ] 9.3 Debugging and reading a stack trace properly
- [ ] 9.4 Measuring performance without lying to yourself — warmup, JMH
- [ ] 9.5 API design in Java
- [ ] 9.6 Packaging and shipping

## Part 10 — Problem solving and algorithms

Forty chapters, planned in detail in CppTB's roadmap and written there. The
*structure* ports: the same waves, the same two-problems-of-each-kind shape,
the same rule that every complexity claim is measured. The *content* does not
port by copy-paste — the I/O layer is different, the collections are different,
there are no pointers, and `long` overflow behaves differently from `long long`.

Plan this part properly when Wave D is done and the collections chapters exist
to build on. Writing it before then means either forward references or
re-teaching `HashMap` in a two-pointers chapter.

---

## Standing work

- Add problems to any chapter that has fewer than two.
- Add `:::memviz` diagrams wherever two variables point at one object — that
  picture is this book's single most useful widget.
- Resolve forward references once their targets exist.
