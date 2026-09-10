---
id: recursion-to-iteration
title: "Off the stack and onto the heap"
difficulty: core
chapter: stack-and-heap
topics: [stack, recursion, iteration]
check: unit
standard: java21
---

Each of these recursive methods overflows the stack on an input a production
system would see. Rewrite them so they do not, keeping the same signature and
the same answers.

- `static long sumTo(int n)` — `1 + 2 + … + n`, for `n >= 0`
- `static int depthOf(Node root)` — the longest path from `root` to a leaf,
  counting nodes; `depthOf(null)` is 0
- `static List<String> flatten(Node root)` — every node's label, in pre-order
  (node, then children left to right)
- `static String repeat(String unit, int times)` — `unit` concatenated `times`
  times, for `times >= 0`

`Node` is given:

```java
record Node(String label, List<Node> children) {}
```

The tests build a chain 300,000 nodes deep. Nothing you write may recurse over
it.

## Starter
```java
record Node(String label, List<Node> children) {}

static long sumTo(int n) {
    return n == 0 ? 0 : n + sumTo(n - 1);
}

static int depthOf(Node root) {
    if (root == null) {
        return 0;
    }
    int deepest = 0;
    for (Node child : root.children()) {
        deepest = Math.max(deepest, depthOf(child));
    }
    return deepest + 1;
}

static List<String> flatten(Node root) {
    List<String> labels = new ArrayList<>();
    if (root == null) {
        return labels;
    }
    labels.add(root.label());
    for (Node child : root.children()) {
        labels.addAll(flatten(child));
    }
    return labels;
}

static String repeat(String unit, int times) {
    return times == 0 ? "" : unit + repeat(unit, times - 1);
}
```

## Tests
```java
checkEq(sumTo(0), 0L);
checkEq(sumTo(1), 1L);
checkEq(sumTo(10), 55L);
checkEq(sumTo(1_000_000), 500000500000L);

Node leaf = new Node("leaf", List.of());
checkEq(depthOf(null), 0);
checkEq(depthOf(leaf), 1);
checkEq(flatten(null), List.of());
checkEq(flatten(leaf), List.of("leaf"));

Node tree = new Node("a", List.of(
    new Node("b", List.of(new Node("d", List.of()))),
    new Node("c", List.of())));
checkEq(depthOf(tree), 3);
checkEq(flatten(tree), List.of("a", "b", "d", "c"));

// A chain far deeper than the stack.
Node chain = new Node("n0", List.of());
for (int i = 1; i <= 300_000; i++) {
    chain = new Node("n" + i, List.of(chain));
}
checkEq(depthOf(chain), 300_001);
List<String> labels = flatten(chain);
checkEq(labels.size(), 300_001);
checkEq(labels.get(0), "n300000");
checkEq(labels.get(labels.size() - 1), "n0");

checkEq(repeat("", 5), "");
checkEq(repeat("ab", 0), "");
checkEq(repeat("ab", 3), "ababab");
checkEq(repeat("x", 200_000).length(), 200_000);
```

## Hints
- `sumTo` and `repeat` have no branching, so they are loops with no bookkeeping
  at all. `repeat` also wants a `StringBuilder` — the recursive version is
  quadratic for the reason chapter 6.4 measured.
- For the tree, replace the call stack with an explicit one: an `ArrayDeque`
  used as a stack (`push` / `pop`) holds the nodes still to visit. The heap has
  room for a hundred thousand entries; the stack does not.
- Pre-order with an explicit stack: pop a node, record it, then push its
  children **in reverse** so the leftmost is popped next.
- `depthOf` needs to know each pending node's depth as well as its identity.
  Push both — two parallel deques, or a small record you declare alongside.
- Watch the empty case in `depthOf` and `flatten`: `null` is 0 and an empty
  list, not a crash.

## Solution
```java
record Node(String label, List<Node> children) {}

static long sumTo(int n) {
    long total = 0;
    for (int i = 1; i <= n; i++) {
        total += i;
    }
    return total;
}

record Pending(Node node, int depth) {}

static int depthOf(Node root) {
    if (root == null) {
        return 0;
    }
    int deepest = 0;
    Deque<Pending> stack = new ArrayDeque<>();
    stack.push(new Pending(root, 1));
    while (!stack.isEmpty()) {
        Pending current = stack.pop();
        deepest = Math.max(deepest, current.depth());
        for (Node child : current.node().children()) {
            stack.push(new Pending(child, current.depth() + 1));
        }
    }
    return deepest;
}

static List<String> flatten(Node root) {
    List<String> labels = new ArrayList<>();
    if (root == null) {
        return labels;
    }
    Deque<Node> stack = new ArrayDeque<>();
    stack.push(root);
    while (!stack.isEmpty()) {
        Node current = stack.pop();
        labels.add(current.label());
        List<Node> children = current.children();
        for (int i = children.size() - 1; i >= 0; i--) {
            stack.push(children.get(i));
        }
    }
    return labels;
}

static String repeat(String unit, int times) {
    StringBuilder builder = new StringBuilder(unit.length() * times);
    for (int i = 0; i < times; i++) {
        builder.append(unit);
    }
    return builder.toString();
}
```

## Notes
The transformation is always the same: whatever the call stack was
remembering, remember it yourself on the heap. For `flatten` that is just the
nodes still to visit. For `depthOf` it is the nodes *and* how deep each one is,
which is why the frame held two values and the explicit version needs a record
to match.

Why the heap wins is arithmetic. A frame for `flatten` holds a `this`-less
receiver, a parameter, a list reference and an iterator — call it 48 bytes, so
a 1 MB stack manages roughly twenty thousand levels. An `ArrayDeque` of three
hundred thousand references is a couple of megabytes on a heap measured in
hundreds of megabytes. The stack is the scarce resource, and it is scarce by three or four
orders of magnitude.

`repeat` is the one where the recursion was not even the main problem. Each
call does `unit + repeat(...)`, allocating a new `String` and copying
everything built so far, so the total copying is quadratic — chapter 6.4's
`reduce`-versus-`joining` measurement, wearing a different hat. Rewriting it as
a loop fixes the stack; rewriting it with a `StringBuilder` fixes the
complexity; and pre-sizing the builder with `unit.length() * times` avoids the
handful of internal array copies on top of that.

Two things this problem is *not* saying. First, recursion is not bad: for a
balanced tree, depth is logarithmic and the recursive `flatten` is clearer than
anything here. It is unbounded depth on untrusted input that is dangerous —
and a linked list, a deeply nested JSON document, or a directory chain are all
inputs an attacker can make deep. Second, Java has no tail-call elimination, so
`sumTo` does not become a loop by itself no matter how tail-recursive it looks.
Some languages promise that; Java does not, and writing as though it did gives
you a `StackOverflowError` in production and nowhere else.
