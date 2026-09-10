---
id: safe-generic-container
title: "A container over an Object array"
difficulty: stretch
chapter: erasure
topics: [erasure, generics, unchecked]
check: unit
standard: java21
---

`new T[n]` does not compile — generic array creation. The standard workaround
is to hold an `Object[]` internally and cast on the way out, which requires
exactly one unchecked cast.

Write a fixed-capacity `Stack<T>`:

- `Stack(int capacity)`
- `push(T item)` — throws `IllegalStateException("full")` when there is no room
- `pop()` — returns the most recently pushed item, throwing
  `NoSuchElementException("empty")` when there is none
- `peek()` — the top item without removing it, same exception when empty
- `size()` and `isEmpty()`

Use an `Object[]` internally. The starter tries to allocate a `T[]` and does not
compile.

## Starter
```java
static final class Stack<T> {
    private final T[] items;
    private int count;

    Stack(int capacity) {
        items = new T[capacity];
    }

    void push(T item) {
        items[count++] = item;
    }

    T pop() {
        return items[--count];
    }

    T peek() {
        return items[count - 1];
    }

    int size() {
        return count;
    }

    boolean isEmpty() {
        return count == 0;
    }
}
```

## Tests
```java
Stack<String> stack = new Stack<>(3);
check(stack.isEmpty());
checkEq(stack.size(), 0);

stack.push("a");
stack.push("b");
checkEq(stack.size(), 2);
checkEq(stack.peek(), "b");
checkEq(stack.size(), 2);
checkEq(stack.pop(), "b");
checkEq(stack.pop(), "a");
check(stack.isEmpty());

checkThrows(NoSuchElementException.class, () -> new Stack<String>(2).pop());
checkThrows(NoSuchElementException.class, () -> new Stack<String>(2).peek());

Stack<Integer> small = new Stack<>(1);
small.push(1);
checkThrows(IllegalStateException.class, () -> small.push(2));

Stack<Integer> numbers = new Stack<>(2);
numbers.push(10);
numbers.push(20);
int top = numbers.pop();
checkEq(top, 20);
```

## Hints
- Hold `Object[]` and declare it `private final Object[] items`.
- `pop` and `peek` must return `T`, so each needs a cast — `(T) items[...]` —
  which produces an unchecked warning.
- Put `@SuppressWarnings("unchecked")` on the smallest scope that works: the
  individual methods, not the class.
- Both empty cases throw `NoSuchElementException`, and a full push throws
  `IllegalStateException`.

## Solution
```java
static final class Stack<T> {
    private final Object[] items;
    private int count;

    Stack(int capacity) {
        items = new Object[capacity];
    }

    void push(T item) {
        if (count == items.length) {
            throw new IllegalStateException("full");
        }
        items[count++] = item;
    }

    @SuppressWarnings("unchecked")
    T pop() {
        if (count == 0) {
            throw new NoSuchElementException("empty");
        }
        T item = (T) items[--count];
        items[count] = null;          // let the popped item be collected
        return item;
    }

    @SuppressWarnings("unchecked")
    T peek() {
        if (count == 0) {
            throw new NoSuchElementException("empty");
        }
        return (T) items[count - 1];
    }

    int size() {
        return count;
    }

    boolean isEmpty() {
        return count == 0;
    }
}
```

## Notes
The cast `(T) items[...]` is unchecked, and it is *safe* — provably so, though
not by the compiler. Only `push` writes to the array, only a `T` can be passed
to `push`, so every occupied slot holds a `T`. The compiler cannot follow that
argument because `T` does not exist at run time; a human can, which is exactly
when `@SuppressWarnings("unchecked")` is legitimate.

Note where the annotation goes: on the two methods that need it, not on the
class. On the class it would also silence a future unchecked warning somewhere
unrelated, which is how a suppression that was once justified becomes a hidden
bug.

`items[count] = null` in `pop` is the detail that separates a toy from a real
container. Without it, the array keeps a reference to the popped object
forever, so the stack holds everything ever pushed alive — a memory leak of
exactly the kind chapter 2.12 described, and the reason `ArrayList.remove` does
the same thing. The array is the only thing referring to it, and nothing else
will clear the slot.

This is what `ArrayList` does internally, for the same reason. Look at its
source and you will find `Object[] elementData` and an `elementData(int)`
helper carrying a single `@SuppressWarnings("unchecked")` — the JDK reaching
for the same escape hatch, in the same narrow way.
