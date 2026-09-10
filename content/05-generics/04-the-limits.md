---
title: "The limits of generics"
navTitle: "The limits"
summary: >-
  No primitives, no generic arrays, and no type variable at run time — what each restriction costs, and the workaround for each.
objectives:
  - Say why List of int does not compile and what boxing costs
  - Explain why generic array creation is forbidden
  - Choose the standard workaround for each restriction
status: complete
standard: java21
requires: [wildcards]
---

Everything awkward about Java generics comes from erasure, and this chapter
collects the consequences in one place — with what to do about each.

## No primitive type arguments

```java run expect-error title="List of int"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<int> numbers = new ArrayList<>();
        numbers.add(1);
        System.out.println(numbers);
    }
}
```

*unexpected type.* A type argument must be a reference type, because erasure
replaces it with `Object` and an `int` is not one. So you write
`List<Integer>` and every element becomes a heap object holding a number.

That is not free:

```java run title="Measured: summing five million values"
import java.util.*;

public class Main {
    static long sink;

    static long sumArray(int[] values) {
        long total = 0;
        for (int v : values) {
            total += v;
        }
        return total;
    }

    static long sumList(List<Integer> values) {
        long total = 0;
        for (int v : values) {          // each element is unboxed here
            total += v;
        }
        return total;
    }

    static long ms(Runnable r) {
        long t = System.nanoTime();
        r.run();
        return (System.nanoTime() - t) / 1_000_000;
    }

    public static void main(String[] args) {
        int n = 5_000_000;
        int[] array = new int[n];
        List<Integer> list = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            array[i] = i;
            list.add(i);
        }

        for (int w = 0; w < 3; w++) {          // warm up
            sink += sumArray(array);
            sink += sumList(list);
        }

        System.out.printf("int[]         %3d ms%n", ms(() -> sink += sumArray(array)));
        System.out.printf("List<Integer> %3d ms%n", ms(() -> sink += sumList(list)));
        System.out.println("(checksum " + sink + ")");
    }
}
```

Several times slower to traverse, and the traversal is the smaller half of the
story. The memory arithmetic is worse: an `int` in an array occupies 4 bytes,
while an `Integer` is a heap object — typically a 16-byte header plus the 4-byte
value, reached through a 4- or 8-byte reference. Around five times the memory,
scattered rather than contiguous, so each element is a potential cache miss
where the array brings sixteen per line.

The workarounds:

- **`int[]`, `long[]`, `double[]`** when the collection is fixed-size.
- **`IntStream`, `LongStream`, `DoubleStream`** — Part 6's primitive streams,
  which exist precisely to avoid boxing in pipelines.
- **A specialised library** — Eclipse Collections, fastutil and others provide
  `IntArrayList` and primitive-keyed maps.
- **`Integer.valueOf` caching** helps a little: values from −128 to 127 are
  cached and shared, which is why `Integer.valueOf(100) == Integer.valueOf(100)`
  is true and the same comparison at 1000 is false. Never rely on it; it is a
  memory optimisation, not a semantic guarantee.

:::note
Project Valhalla is the long-running effort to give the JVM value types and
generics over primitives — `List<int>` with no boxing. It is not in Java 21.
Until it lands, the restriction stands.
:::

## No generic array creation

```java run expect-error title="Neither of these"
import java.util.*;

public class Main {
    static <T> T[] makeArray(int size) {
        return new T[size];
    }

    public static void main(String[] args) {
        List<String>[] lists = new List<String>[10];
        System.out.println(lists.length);
    }
}
```

*generic array creation*, twice over. The reason is the clash between the two
systems this book has now described: arrays are covariant and check stores at
run time, while generics are invariant and check nothing at run time.

If `new List<String>[10]` were allowed, it could be assigned to an `Object[]`,
and a `List<Integer>` stored into it. The array's run-time store check would
compare against `List` — the erasure — and see nothing wrong. The type system
would have been defeated with no warning anywhere.

The workarounds:

- **Use a collection.** `List<List<String>>` instead of `List<String>[]` is
  almost always right.
- **Hold `Object[]` internally and cast on the way out**, with one
  `@SuppressWarnings("unchecked")` — chapter 5.2's `safe-generic-container`,
  and what `ArrayList` itself does.
- **Take a `Class<T>` or an array to fill.** `Collection.toArray(T[])` exists
  for this: the caller supplies an array of the right run-time type.

```java run title="How the JDK does it"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> names = List.of("Ada", "Grace");

        String[] array = names.toArray(new String[0]);
        System.out.println(Arrays.toString(array) + " of " + array.getClass().getSimpleName());

        Object[] objects = names.toArray();
        System.out.println("without a hint: " + objects.getClass().getSimpleName());
    }
}
```

`toArray(new String[0])` hands the method an object whose run-time type is
`String[]`, which is exactly the information erasure removed. The no-argument
`toArray()` can only produce `Object[]`, for the same reason.

## No type variable at run time

```java run expect-error title="catch cannot name a type variable"
public class Main {
    static <T extends Exception> void runCatching(Runnable action, Class<T> type) {
        try {
            action.run();
        } catch (T e) {
            System.out.println("caught");
        }
    }

    public static void main(String[] args) {
        runCatching(() -> { }, IllegalStateException.class);
    }
}
```

*unexpected type.* Catching is a run-time decision — the JVM compares the
thrown object's class against the clause's — and `T` does not exist then.

The workaround is the one the signature already hints at: take a `Class<T>`,
catch broadly, and test:

```java run title="Passing the type as a value"
public class Main {
    static <T extends Exception> String runCatching(Runnable action, Class<T> type) {
        try {
            action.run();
            return "no failure";
        } catch (Exception e) {
            if (type.isInstance(e)) {
                return "caught " + type.getSimpleName();
            }
            throw new RuntimeException("unexpected", e);
        }
    }

    public static void main(String[] args) {
        System.out.println(runCatching(() -> { }, IllegalStateException.class));
        System.out.println(runCatching(
            () -> { throw new IllegalStateException("boom"); }, IllegalStateException.class));
    }
}
```

A `Class<T>` is a **type token**: the type argument, passed as an ordinary
value, so it survives to run time. `EnumSet.noneOf(Class<E>)`,
`Collections.checkedList` and every dependency-injection framework work this
way.

## The full list

| Cannot | Because | Instead |
|---|---|---|
| `List<int>` | a type argument must be a reference | `List<Integer>`, or `int[]` / `IntStream` |
| `new T()` | no constructor to call | pass a `Supplier<T>` or `Class<T>` |
| `new T[n]`, `new List<String>[n]` | array stores are checked, generics are not | a collection, or `Object[]` plus one cast |
| `catch (T e)` | catching is a run-time comparison | `Class<T>` and `isInstance` |
| `x instanceof List<String>` | nothing to test at run time | `List<?>` |
| two overloads with the same erasure | one signature in the class file | different names |
| a static member using the class's `T` | no instance supplied it | declare the method's own `<T>` |

:::quiz
{
  "question": "Why is `new List<String>[10]` forbidden when `new String[10]` is fine?",
  "options": [
    { "text": "Array stores are checked at run time against the erasure, which would let a List<Integer> in unnoticed", "correct": true, "why": "Right. The array would check stores against List, since the type argument is erased, so storing a List<Integer> would pass the check and defeat the type system with no warning anywhere." },
    { "text": "Arrays cannot hold objects that have type parameters", "correct": false, "why": "They can — List<String>[] is a legal *type*, and you can obtain one via an unchecked cast. It is the creation expression that is forbidden." },
    { "text": "The array would not know its length at run time", "correct": false, "why": "Arrays always know their length; it is stored in the object header and is unrelated to generics." },
    { "text": "Because generics are covariant and arrays are invariant", "correct": false, "why": "It is the other way round: arrays are covariant and generics are invariant, and the clash between those two is precisely the problem." }
  ]
}
:::

## Practice

:::exercise avoid-the-boxing

:::exercise type-token-factory

:::recap
- A type argument must be a reference type, so `List<Integer>` boxes: several
  times slower to traverse and around five times the memory of an `int[]`.
- Generic array creation is forbidden because array stores are checked against
  the erasure, which would let the wrong element in silently.
- `new T()`, `catch (T e)` and `instanceof List<String>` all fail for the same
  reason: nothing named `T` exists at run time.
- The general workaround is a **type token** — pass `Class<T>` or a
  `Supplier<T>` so the type survives as a value. `toArray(new String[0])` is
  the same idea.
- Prefer a collection to a generic array; where you must, hold `Object[]` and
  isolate a single unchecked cast.
:::
