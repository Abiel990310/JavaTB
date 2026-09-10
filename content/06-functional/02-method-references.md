---
title: "Method references"
navTitle: "Method references"
summary: >-
  Four shapes of `::`, what each one desugars to, and the one that evaluates its receiver the moment you write it.
objectives:
  - Recognise the four kinds of method reference and what each desugars to
  - Explain when a receiver is captured and when it is looked up per call
  - Say why an ambiguous reference is a compile error rather than a guess
  - Decide when a lambda reads better than a reference
status: complete
standard: java21
requires: [lambdas]
---

`s -> s.length()` is a lambda whose entire body is a call to an existing
method. Java has a shorter spelling for that case, and it is worth learning not
because it saves eight characters but because one of its four forms behaves
differently from the lambda it replaces.

## The four shapes

```java run title="One of each"
import java.util.*;
import java.util.function.*;

public class Main {
    record Point(int x, int y) {}

    public static void main(String[] args) {
        // 1. static method
        Function<String, Integer> parse = Integer::parseInt;

        // 2. instance method of a particular object — "bound"
        String greeting = "hello";
        Supplier<Integer> lengthOfGreeting = greeting::length;

        // 3. instance method of whichever object turns up — "unbound"
        Function<String, Integer> anyLength = String::length;

        // 4. constructor
        Supplier<ArrayList<String>> newList = ArrayList::new;
        BiFunction<Integer, Integer, Point> newPoint = Point::new;
        IntFunction<String[]> newArray = String[]::new;

        System.out.println(parse.apply("42"));
        System.out.println(lengthOfGreeting.get());
        System.out.println(anyLength.apply("goodbye"));
        System.out.println(newList.get());
        System.out.println(newPoint.apply(1, 2));
        System.out.println(newArray.apply(3).length);
    }
}
```

The two in the middle are the ones to keep straight, because they look almost
identical and mean different things.

`greeting::length` is **bound**: the receiver is fixed, and the resulting
`Supplier` takes no arguments. `String::length` is **unbound**: there is no
receiver yet, so the interface's first parameter becomes one. That is why
`String::length` is a `Function<String, Integer>` — one argument in, and it is
the object the method is called on.

Unbound references shift every parameter along by one:

```java run title="The receiver is the first parameter"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        // s.startsWith(prefix)  becomes  apply(s, prefix)
        BiFunction<String, String, Boolean> startsWith = String::startsWith;
        System.out.println(startsWith.apply("hello", "he"));

        BiFunction<String, String, String> concat = String::concat;
        System.out.println(concat.apply("foot", "ball"));
    }
}
```

`String::startsWith` names a one-argument method and satisfies a two-argument
interface, which is not a contradiction once you know where the extra argument
goes.

## Bound references capture eagerly

Here is the difference that matters. A lambda body runs when the lambda is
called. The receiver expression of a bound method reference runs when the
*reference* is created:

```java run title="Reassigning after the reference"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        StringBuilder text = new StringBuilder("first");

        Supplier<String> reference = text::toString;
        Supplier<String> lambda = () -> text.toString();

        System.out.println("reference: " + reference.get());
        System.out.println("lambda:    " + lambda.get());
    }
}
```

Both print `first`, and both would have to — `text` is effectively final, so it
cannot be reassigned. The rule only becomes visible where the receiver is not a
local variable you own:

```java run title="Where the output goes"
import java.io.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        PrintStream original = System.out;

        Consumer<String> reference = System.out::println;
        Consumer<String> lambda = s -> System.out.println(s);

        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        System.setOut(new PrintStream(captured, true));

        reference.accept("from the reference");
        lambda.accept("from the lambda");

        System.setOut(original);
        System.out.println("captured: " + captured.toString().trim());
    }
}
```

Read the output carefully. `from the reference` appears on the console, before
the redirect had any effect — because `System.out::println` evaluated
`System.out` at the moment the `Consumer` was built and stored that stream
inside it. `from the lambda` went into the buffer, because `s ->
System.out.println(s)` re-reads the static field on every call.

This is not an edge case dressed up. Any bound reference whose receiver is a
field, a static, or a method call has the same shape: `config.getTimeout()`
read through `config::getTimeout` sees whichever `config` object existed when
the reference was made, forever. If you want the current value, write the
lambda.

The same rule produces a surprise with `null`:

```java run expect-throw title="A reference to nothing"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        String missing = null;

        System.out.println("about to build the reference");
        Supplier<Integer> reference = missing::length;
        System.out.println("never printed");
        System.out.println(reference.get());
    }
}
```

The `NullPointerException` arrives on the line that *creates* the reference,
not the line that uses it — and with no helpful message, since there was no
call to describe. `() -> missing.length()` would have built fine and thrown
later, from inside `get()`. Neither behaviour is wrong; they are simply
different, and a stack trace pointing at an assignment is confusing until you
know why.

## Ambiguity is a compile error

```java run expect-error title="Two methods match"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Function<Integer, String> toText = Integer::toString;
        System.out.println(toText.apply(42));
    }
}
```

*reference to toString is ambiguous — both method `toString(int)` in Integer
and method `toString()` in Integer match.* One reading is the static
`Integer.toString(int)`; the other is the unbound instance method
`Integer::toString`, where the argument becomes the receiver. Both produce a
`Function<Integer, String>` and both would work. Java will not choose, so you
say which:

```java run title="Saying which one"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Function<Integer, String> viaStatic = n -> Integer.toString(n);
        Function<Integer, String> viaInstance = n -> n.toString();
        Function<Object, String> viaObject = String::valueOf;

        System.out.println(viaStatic.apply(42));
        System.out.println(viaInstance.apply(42));
        System.out.println(viaObject.apply(42));
        System.out.println(viaObject.apply(null));
    }
}
```

`String::valueOf` is the reference worth remembering here: it is a static, so
there is nothing to be ambiguous about, and unlike `toString()` it survives a
`null`.

## `this::` and `super::`

Inside an instance method, `this` is a receiver like any other:

```java run title="Referring to your own methods"
import java.util.*;
import java.util.function.*;

public class Main {
    private final String prefix;

    Main(String prefix) {
        this.prefix = prefix;
    }

    private String decorate(String value) {
        return prefix + value;
    }

    List<String> decorateAll(List<String> values) {
        List<String> result = new ArrayList<>();
        for (String value : values) {
            result.add(apply(this::decorate, value));
        }
        return result;
    }

    static String apply(UnaryOperator<String> op, String value) {
        return op.apply(value);
    }

    public static void main(String[] args) {
        System.out.println(new Main("> ").decorateAll(List.of("a", "b")));
    }
}
```

`this::decorate` is a bound reference whose receiver is the enclosing object,
which is why it can see the private `prefix`.

`super::` is the same idea aimed one level up, and it reaches the superclass
implementation even when the current class overrides it:

```java run title="Reaching past an override"
import java.util.function.*;

public class Main {
    static class Base {
        @Override
        public String toString() {
            return "Base";
        }
    }

    static class Sub extends Base {
        @Override
        public String toString() {
            return "Sub";
        }

        Supplier<String> viaReference() {
            return super::toString;
        }

        Supplier<String> viaLambda() {
            return () -> super.toString();
        }
    }

    public static void main(String[] args) {
        Sub sub = new Sub();
        System.out.println(sub);
        System.out.println(sub.viaReference().get() + " / " + sub.viaLambda().get());
    }
}
```

Both print `Base`, so the reference buys nothing here but brevity — the point
is that `super` keeps working inside a lambda, unlike inside an anonymous class
where `super` would mean the anonymous class's own superclass instead.

Referring to `this` has one consequence worth flagging: the reference keeps the
enclosing object alive. Store `this::handle` in a long-lived listener list and
you have stored the whole object, which is a common shape for a listener leak.

## Constructors, including arrays

`Type::new` is a reference to every constructor at once; the target type picks
which:

```java run title="Which constructor?"
import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Supplier<ArrayList<String>> empty = ArrayList::new;
        IntFunction<ArrayList<String>> sized = ArrayList::new;
        Function<Collection<String>, ArrayList<String>> copy = ArrayList::new;

        System.out.println(empty.get());
        System.out.println(sized.apply(100));
        System.out.println(copy.apply(List.of("a", "b")));
    }
}
```

All three are the text `ArrayList::new`; the interface on the left decides
whether that means `ArrayList()`, `ArrayList(int)` or
`ArrayList(Collection)`. If no constructor matches the target, it is a compile
error, not a runtime surprise.

`String[]::new` is the array form, and its shape is fixed: `IntFunction<T[]>`,
taking the length. You will meet it as the argument to
`Stream.toArray(String[]::new)` in the next chapter, where it exists for
exactly the reason chapter 5.4 gave — the stream cannot write `new T[n]`, so
you hand it a factory that can.

## When not to use one

A method reference is shorter, and shorter is not the goal. Three cases where
the lambda reads better:

**When the receiver must be current.** Covered above: `config::getTimeout`
freezes the receiver, `() -> config.getTimeout()` does not.

**When the parameter name carries meaning.** `orders.forEach(this::process)`
tells you nothing about what is being processed;
`orders.forEach(order -> process(order))` says `order` once, which is often
worth the characters.

**When the reader has to work out the arity.** `String::compareTo` as a
`Comparator<String>` is an unbound reference where the receiver is the first
argument and the parameter is the second — correct, and slower to read than
`(a, b) -> a.compareTo(b)` for anyone not fluent in the shift. The idiomatic
answer here is neither: it is `Comparator.naturalOrder()`.

The good cases are the ones where the reference removes a name that adds
nothing: `map(String::length)`, `filter(Objects::nonNull)`,
`forEach(System.out::println)`, `collect(toCollection(TreeSet::new))`. In each,
the lambda would have invented a variable only to pass it straight through.

## One trap with `Comparator`

```java run title="comparing versus comparingInt"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> words = new ArrayList<>(List.of("kiwi", "fig", "banana"));

        words.sort(Comparator.comparing(String::length));       // boxes
        System.out.println(words);

        words.sort(Comparator.comparingInt(String::length));    // does not
        System.out.println(words);
    }
}
```

Both sort correctly. `Comparator.comparing` takes a
`Function<T, U extends Comparable<U>>`, so `String::length` is adapted to
`Function<String, Integer>` and every comparison boxes an `int`.
`comparingInt` takes a `ToIntFunction<T>` and does not. The reference text is
identical in both lines; the method you call decides whether it allocates —
which is chapter 6.1's measurement showing up in a place where nothing in the
code looks like boxing.

:::quiz
{
  "question": "`Consumer<String> c = System.out::println;` is created, then `System.setOut(...)` redirects the stream, then `c.accept(\"x\")` runs. Where does the text go?",
  "options": [
    { "text": "To the original stream, because the receiver `System.out` was evaluated when the reference was created", "correct": true, "why": "Right. A bound method reference evaluates its receiver expression once, at creation, and stores the result." },
    { "text": "To the new stream, because `System.out` is a static field read at call time", "correct": false, "why": "That is what the lambda `s -> System.out.println(s)` does. The reference already resolved the field." },
    { "text": "To both, since the reference holds the field rather than the value", "correct": false, "why": "There is no mechanism for holding a field reference in Java; the value was copied." },
    { "text": "It throws, because the stream the reference captured has been replaced", "correct": false, "why": "`setOut` replaces which stream the field names; the old `PrintStream` is still open and still works." }
  ]
}
:::

## Practice

:::exercise reference-or-lambda

:::exercise build-a-registry

:::recap
- Four shapes: `Type::staticMethod`, `object::instanceMethod` (bound),
  `Type::instanceMethod` (unbound — the receiver becomes the first parameter),
  and `Type::new`, including `String[]::new` as `IntFunction<T[]>`.
- A **bound** reference evaluates its receiver expression once, when the
  reference is created. `System.out::println` captures today's stream;
  `s -> System.out.println(s)` reads it every call.
- For the same reason, `null::anything` throws immediately, at the assignment.
- An ambiguous reference (`Integer::toString`) is a compile error. Write the
  lambda, or pick an unambiguous static like `String::valueOf`.
- `this::method` captures the enclosing object, keeping it alive for as long as
  the reference lives.
- Prefer the reference when it deletes a pass-through variable; prefer the
  lambda when the receiver must be current, the parameter name informs, or the
  arity shift is doing the reader no favours.
