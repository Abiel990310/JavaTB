---
title: "Generic classes and methods"
navTitle: "Generic classes"
summary: >-
  Writing a class or a method once and letting the caller supply the type, and the bounds that let you do something with it.
objectives:
  - Declare a generic class and a generic method, and say where each type parameter belongs
  - Use a bounded type parameter to call methods on a type variable
  - Explain what a raw type gives up and what it costs
status: complete
standard: java21
requires: [immutable-collections]
---

`List<String>` has appeared in every chapter since Part 1. This part is about
the angle brackets: what they check, what they cost, and where they stop
working.

The problem generics solve is narrow and important. Before Java 5, a `List`
held `Object`, so every read needed a cast, and a wrong cast failed at run time
in a place unrelated to the mistake:

```java run expect-throw title="Life before generics"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List raw = new ArrayList();          // a raw type: no element type at all
        raw.add("a string");
        raw.add(42);                         // nothing objects

        String first = (String) raw.get(0);
        System.out.println("got: " + first);

        String second = (String) raw.get(1); // ClassCastException, far from the add
        System.out.println(second);
    }
}
```

Note where the failure lands: on the *read*, not on the `add` that put the
wrong thing in. In a real program those are different files.

Generics move that check to compile time. `List<String>` will not accept an
`Integer`, so the mistake is reported at the line that makes it.

## A generic class

```java run title="One class, any element type"
public class Main {
    static final class Box<T> {
        private final T value;

        Box(T value) {
            this.value = value;
        }

        T get() {
            return value;
        }

        <R> Box<R> map(java.util.function.Function<T, R> f) {
            return new Box<>(f.apply(value));
        }
    }

    public static void main(String[] args) {
        Box<String> text = new Box<>("hello");
        Box<Integer> length = text.map(String::length);

        System.out.println(text.get() + " has length " + length.get());

        String value = text.get();          // no cast needed
        System.out.println("still a String: " + value.toUpperCase());
    }
}
```

`<T>` after the class name declares a **type parameter**: a placeholder the
caller fills in. Inside the class, `T` is an ordinary type — you can declare
fields of it, take it as a parameter, return it.

The diamond `<>` on `new Box<>(...)` asks the compiler to infer the argument
from context. Writing `new Box<String>("hello")` is the same thing spelled out.

`map` declares its **own** type parameter `<R>`, before the return type,
because the result type has nothing to do with the box's. A method's type
parameters are independent of its class's.

By convention: `T` for a type, `E` for an element, `K` and `V` for a map's key
and value, `R` for a result. They are conventions, not rules, and a longer name
is fine where it helps.

## A generic method

```java run title="Type parameters on a method"
import java.util.*;

public class Main {
    static <T> void swap(T[] items, int i, int j) {
        T temp = items[i];
        items[i] = items[j];
        items[j] = temp;
    }

    static <T> List<T> repeat(T item, int times) {
        List<T> result = new ArrayList<>();
        for (int i = 0; i < times; i++) {
            result.add(item);
        }
        return result;
    }

    public static void main(String[] args) {
        Integer[] numbers = { 1, 2, 3 };
        swap(numbers, 0, 2);
        System.out.println(Arrays.toString(numbers));

        System.out.println(repeat("ha", 3));
        System.out.println(repeat(7, 2));       // T inferred as Integer
    }
}
```

The `<T>` goes **before the return type**. It is easy to forget, and the error
when you do — *cannot find symbol: class T* — does not obviously say so.

A static method cannot use its class's type parameters, because there is no
instance to have supplied them. That is why `swap` declares its own.

## Bounds: doing something with T

An unbounded `T` could be anything, so the only methods available on it are
`Object`'s. To do more, constrain it:

```java run title="extends, so the type variable has methods"
import java.util.*;

public class Main {
    static <T extends Comparable<T>> T largest(List<T> items) {
        T best = items.get(0);
        for (T item : items) {
            if (item.compareTo(best) > 0) {     // available because of the bound
                best = item;
            }
        }
        return best;
    }

    interface Named {
        String name();
    }

    record Score(int points, String name) implements Comparable<Score>, Named {
        @Override
        public int compareTo(Score other) {
            return Integer.compare(points, other.points);
        }
    }

    // Two bounds at once: the type must satisfy both
    static <T extends Comparable<T> & Named> String bestName(List<T> items) {
        return largest(items).name();
    }

    public static void main(String[] args) {
        System.out.println(largest(List.of(3, 9, 2)));
        System.out.println(largest(List.of("pear", "apple", "fig")));
        System.out.println(bestName(List.of(new Score(3, "low"), new Score(9, "high"))));
    }
}
```

`<T extends Comparable<T>>` says "any type that can be compared with itself".
Inside the method, `compareTo` is available; outside, the compiler rejects a
call with a type that does not qualify.

`extends` here covers interfaces too — there is no `implements` in a bound.
Several bounds are joined with `&`, and at most one may be a class, which must
come first.

## Raw types

```java run expect-error title="Generics are checked"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        names.add("Ada");
        names.add(42);
        System.out.println(names);
    }
}
```

*incompatible types: int cannot be converted to String.* The mistake is
reported where it is made.

Using `List` without a type argument — a **raw type** — turns that off. It
exists only so that code written before Java 5 still compiles, and javac warns
about it: *found raw type: List*. Treat the warning as an error in your own
code; there is no situation where a raw type is the right answer in new work.

:::note
Type arguments must be reference types. `List<int>` does not compile — you
write `List<Integer>` and pay for boxing. That restriction, and the reason for
it, is chapter 5.4's subject, along with the other things generics cannot do.
:::

:::quiz
{
  "question": "Why does `static <T> void swap(T[] items, int i, int j)` declare its own `<T>` even inside a generic class `Box<T>`?",
  "options": [
    { "text": "A static method has no instance, so the class's type parameter is not available to it", "correct": true, "why": "Right. A class's type parameter is supplied when an instance is created, and a static method is called without one — so it must declare any type parameters it needs itself." },
    { "text": "To avoid a name clash with the class's T", "correct": false, "why": "A clash would be a shadowing warning at most. The reason is that the class's parameter genuinely does not exist in a static context." },
    { "text": "Because arrays cannot use a class's type parameter", "correct": false, "why": "Arrays and generics do interact badly — chapter 5.4 — but that is not what forces the declaration here. An instance method taking T[] would compile fine." },
    { "text": "It does not need to; the declaration is optional", "correct": false, "why": "Removing it gives *cannot find symbol: class T*. The compiler has no T in scope for a static member." }
  ]
}
:::

## Practice

:::exercise generic-pair

:::exercise bounded-max

:::recap
- A type parameter after the class name — `class Box<T>` — is filled in by the
  caller, and `T` behaves like an ordinary type inside the class.
- A method declares its own type parameters before the return type. A static
  method must, because a class's parameters come from an instance it does not
  have.
- An unbounded `T` offers only `Object`'s methods. `<T extends Comparable<T>>`
  buys `compareTo`; several bounds join with `&`.
- The diamond `<>` infers the argument from context.
- A raw type turns the checking off and exists only for pre-Java-5
  compatibility. javac warns; treat it as an error.
:::
