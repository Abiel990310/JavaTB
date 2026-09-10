---
id: flatten-the-instanceof
title: "Let dispatch ask the question"
difficulty: core
chapter: polymorphism
topics: [polymorphism, design]
check: unit
standard: java21
---

A `render` method has to produce a one-line description of any `Node`: plain
text, a heading, or a bullet.

- `Text("hello")` renders as `hello`
- `Heading("Intro", 2)` renders as `## Intro` — one `#` per level, then a
  space, then the text
- `Bullet("first")` renders as `- first`

Write it so that `render(Node)` contains **no `instanceof` and no cast**. Each
node type answers for itself.

The three classes are stubs. Fill them in, and give `Node` whatever it needs so
the single line in `render` works for all three.

## Starter
```java
static abstract class Node {
    abstract String render();
}

static class Text extends Node {
    Text(String content) {
    }

    @Override
    String render() {
        return null;
    }
}

static class Heading extends Node {
    Heading(String content, int level) {
    }

    @Override
    String render() {
        return null;
    }
}

static class Bullet extends Node {
    Bullet(String content) {
    }

    @Override
    String render() {
        return null;
    }
}

static String renderAll(Node[] nodes) {
    StringBuilder out = new StringBuilder();
    for (Node n : nodes) {
        out.append(n.render()).append('\n');
    }
    return out.toString();
}
```

## Tests
```java
checkEq(new Text("hello").render(), "hello");
checkEq(new Heading("Intro", 2).render(), "## Intro");
checkEq(new Heading("Title", 1).render(), "# Title");
checkEq(new Heading("Deep", 4).render(), "#### Deep");
checkEq(new Bullet("first").render(), "- first");
checkEq(new Text("").render(), "");

Node[] doc = { new Heading("Intro", 1), new Text("body"), new Bullet("point") };
checkEq(renderAll(doc), "# Intro\nbody\n- point\n");

Node asNode = new Bullet("through the parent type");
checkEq(asNode.render(), "- through the parent type");
```

## Hints
- Each class needs a field for its content, assigned in its constructor — the
  starters accept the argument and drop it.
- `"#".repeat(level)` gives you the right number of hashes.
- `renderAll` already works. Do not change it; it is the evidence that the
  design is right.

## Solution
```java
static abstract class Node {
    abstract String render();
}

static class Text extends Node {
    private final String content;

    Text(String content) {
        this.content = content;
    }

    @Override
    String render() {
        return content;
    }
}

static class Heading extends Node {
    private final String content;
    private final int level;

    Heading(String content, int level) {
        this.content = content;
        this.level = level;
    }

    @Override
    String render() {
        return "#".repeat(level) + " " + content;
    }
}

static class Bullet extends Node {
    private final String content;

    Bullet(String content) {
        this.content = content;
    }

    @Override
    String render() {
        return "- " + content;
    }
}

static String renderAll(Node[] nodes) {
    StringBuilder out = new StringBuilder();
    for (Node n : nodes) {
        out.append(n.render()).append('\n');
    }
    return out.toString();
}
```

## Notes
Written by hand without polymorphism, `render` looks like this:

```java
static String render(Node n) {
    if (n instanceof Text t) {
        return t.content();
    } else if (n instanceof Heading h) {
        return "#".repeat(h.level()) + " " + h.content();
    } else if (n instanceof Bullet b) {
        return "- " + b.content();
    }
    throw new IllegalArgumentException("unknown node type");
}
```

It works. It is also worse in three specific ways, and naming them is the point
of the exercise.

**It needs every field exposed.** The chain has to reach inside each node to
render it, so `content` and `level` need getters that exist only to serve this
one method. The polymorphic version keeps them private, because the code that
uses them lives on the class that owns them.

**The final `throw` is unreachable in principle and required in practice.** The
compiler cannot see that the three cases are exhaustive, so the method needs an
arm for a case that should never happen — and if a fourth node type is added,
that arm becomes the one that runs, at run time, in production.

**Adding a type means editing this method**, and every other method shaped like
it. With dispatch, a new node type is one new class and nothing else changes:
`renderAll` was never touched in this exercise and works for all three.

The one case where the chain is the better answer is when the set of types is
genuinely closed and you want the compiler to enforce that it is. That is what
`sealed` is for, in chapter 2.11 — it turns "should never happen" into "cannot
compile if you miss one".

`abstract` on `Node.render()` is doing real work here too: it declares that
every node renders without saying how, so there is no placeholder to inherit by
accident. Chapter 2.8 covers it properly.
