---
title: "Hello, JVM"
navTitle: "Hello, JVM"
summary: >-
  How source text becomes a class file, what runs that class file, and which of the three stages an error came from.
objectives:
  - Explain what javac and java each do, and what a class file holds
  - Tell from an error message which stage produced it
  - Compile and run a Java program from source
status: complete
standard: java21
---

A Java program starts life as text you can read and ends as instructions
something can execute. Unlike C or Go, that something is not your processor. It
is another program — a virtual machine — and everything that makes Java feel
the way it does follows from that one decision.

The cost is an extra step you have to understand. The benefit is that the same
compiled file runs unchanged on a laptop, a phone and a server with a different
processor architecture. This chapter is about that step: what each tool does,
what sits between them, and how to tell which of them is complaining at you.

Here is the whole thing. Press **Run**.

```java run title="The smallest useful program"
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, JVM");
    }
}
```

That worked, so a lot of machinery worked. Let us take it apart.

## What each part is doing

`public class Main` declares a class named `Main`. In Java every method lives
inside a class — there is no such thing as a free-standing function — so even a
one-line program needs one. The name is not arbitrary: a `public` class must
live in a file with a matching name. Ours is in `Main.java`, so the class must
be `Main`. Rename one without the other and the compiler stops you before
anything else happens.

`public static void main(String[] args)` is the method the launcher calls. It
is special only because the JVM is written to look for a method with exactly
this shape: public, static, returning nothing, taking an array of strings. Get
any part of it wrong and the class still compiles perfectly — it simply cannot
be started, which is a distinction worth holding on to.

`System.out.println(...)` reaches into the `System` class, takes its `out`
field — an output stream connected to your terminal — and calls `println` on
it. There is no built-in print statement in Java. Printing is an ordinary
method call on an ordinary object, and you could replace `System.out` with
something else and every `println` in your program would go there instead.

:::note
Every runnable sample on this site is compiled as `Main.java`, so they all
declare `public class Main`. In your own projects you will name classes after
what they do; here the name is fixed by the machinery that runs them for you.
:::

## Two tools, two stages

Running that program actually took two steps.

The first is **`javac`**, the compiler. It reads `Main.java` and writes
`Main.class`. That file is not text and it is not machine code for your
processor. It is *bytecode*: instructions for an idealised machine that does
not physically exist.

You can see that it is a real, structured format. Every class file starts with
the same four bytes:

```java run title="What a class file starts with"
public class Main {
    public static void main(String[] args) {
        // The first four bytes of every .class file ever produced.
        int magic = 0xCAFEBABE;
        System.out.printf("magic   = %08X%n", magic);
        System.out.println("version = " + Runtime.version().feature());
    }
}
```

The second step is **`java`**, the launcher. It starts a Java Virtual Machine,
loads `Main.class`, verifies that the bytecode is well formed, finds `main`,
and calls it. While the program runs, the JVM watches which methods are used
most and compiles those to real machine code on the fly. A method that runs
once stays interpreted; a method in a hot loop becomes machine code within
milliseconds. This is why Java benchmarks written naively are almost always
wrong, and why a whole chapter later in this book is about measuring properly.

You can look at the bytecode. Press **Bytecode** on this sample rather than
**Run**:

```java run bytecode title="The same program, as the JVM sees it"
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, JVM");
    }
}
```

Four instructions do the work. `getstatic` pushes `System.out` onto a stack;
`ldc` pushes the string constant; `invokevirtual` calls `println` with them;
`return` ends the method. The JVM is a *stack machine* — it has no registers in
its instruction set, only a working stack that operands are pushed onto and
popped off. That is a deliberate choice: a stack machine's instructions do not
mention register names, so the same bytecode is equally valid on a processor
with sixteen registers and one with thirty-two.

:::memviz
{
  "title": "System.out.println(\"Hello, JVM\") as four instructions",
  "steps": [
    {
      "caption": "getstatic pushes a reference to System.out onto the operand stack.",
      "line": 1,
      "stack": [
        { "id": "op1", "name": "operand stack", "type": "",
          "fields": [{ "k": "top", "v": "→ System.out", "anchor": "op1.top" }] }
      ],
      "heap": [ { "id": "out", "value": "PrintStream", "state": "new" } ],
      "arrows": [ { "from": "op1.top", "to": "out" } ]
    },
    {
      "caption": "ldc pushes the string constant, read from the class file's constant pool.",
      "line": 2,
      "stack": [
        { "id": "op1", "name": "operand stack", "type": "",
          "fields": [
            { "k": "top", "v": "→ \"Hello, JVM\"", "anchor": "op1.top" },
            { "k": "", "v": "→ System.out", "anchor": "op1.below" }
          ] }
      ],
      "heap": [
        { "id": "str", "value": "\"Hello, JVM\"", "state": "new" },
        { "id": "out", "value": "PrintStream" }
      ],
      "arrows": [
        { "from": "op1.top", "to": "str" },
        { "from": "op1.below", "to": "out" }
      ]
    },
    {
      "caption": "invokevirtual pops both, calls println on the stream with the string, and pushes nothing back — println returns void.",
      "line": 3,
      "stack": [
        { "id": "op1", "name": "operand stack", "type": "",
          "fields": [{ "k": "", "v": "(empty)" }] }
      ],
      "heap": [
        { "id": "str", "value": "\"Hello, JVM\"" },
        { "id": "out", "value": "PrintStream" }
      ],
      "arrows": []
    },
    {
      "caption": "return ends main. With no frames left, the JVM shuts down.",
      "line": 4,
      "stack": [],
      "heap": [
        { "id": "str", "value": "\"Hello, JVM\"", "state": "freed" },
        { "id": "out", "value": "PrintStream" }
      ],
      "arrows": []
    }
  ]
}
:::

## Errors come from one of three places

Almost every confusing Java message becomes obvious once you know which stage
produced it. There are three, and they happen in order.

**The compiler rejects the source.** Nothing is produced, no class file is
written, and the message names a file and a line:

```java run expect-error title="javac will not accept this"
public class Main {
    public static void main(String[] args) {
        int count = "seven";
        System.out.println(count);
    }
}
```

That is `incompatible types: String cannot be converted to int`. The compiler
knows `count` is an `int` and that `"seven"` is not one, and it says so before
your program has any chance to run. Errors at this stage are the cheap ones.

**The launcher cannot start the class.** The file compiled, so `javac` was
happy, but the JVM could not find what it needed:

```
Error: Main method not found in class Greeter, please define the main method as:
   public static void main(String[] args)
```

Spell `main` as `Main`, leave off `static`, or return `int` instead of `void`,
and this is what you get: a perfectly valid class that simply is not a program.
Note there is no line number, because nothing of yours ever ran.

**The program throws while running.** Now you get a stack trace:

```java run expect-throw title="An exception nobody caught"
public class Main {
    public static void main(String[] args) {
        String name = null;
        System.out.println(name.length());
    }
}
```

Read a stack trace from the top. The first line names the exception type and,
since Java 14, describes precisely which part of the expression was null —
`Cannot invoke "String.length()" because "name" is null`. The lines under it
are the call stack at the moment of failure, innermost first, each with the
file and line number. The one nearest the top that names *your* file is almost
always where to look.

:::pitfall
A stack trace is not a crash log to be skimmed for the word "error". It is a
precise statement of what was being done, on which line, on behalf of which
caller. Reading the top three lines carefully is faster than any amount of
adding print statements.
:::

## Why the extra step exists

A C++ compiler produces machine code for one processor architecture, which is
why software is shipped as separate downloads per platform. `javac` produces
bytecode for a machine that does not exist, and every real platform ships a JVM
that knows how to run it. The portability is not a property of the language; it
is a property of having agreed on that intermediate format.

You pay for it in two ways. Starting a JVM takes tens of milliseconds before
your `main` begins, which matters for short-lived command-line tools and not at
all for a server that runs for weeks. And your program's speed depends on
decisions made while it runs, which makes performance harder to reason about
than in a language that compiles once, ahead of time.

You gain more than portability, though. Because the JVM is watching the program
execute, it can optimise using facts a static compiler could never prove — that
a particular method is, in this run, never overridden; that a branch is always
taken. That is why long-running Java can be genuinely fast, and why it is slow
for the first few thousand iterations of anything.

:::quiz
{
  "question": "You compile a class successfully, then run it and see `Error: Main method not found`. What went wrong?",
  "options": [
    { "text": "The source has a syntax error", "correct": false, "why": "No — the compiler would have refused to produce a class file at all, and you would have seen a message naming a line." },
    { "text": "The class compiled fine but has no method with the exact shape the launcher looks for", "correct": true, "why": "Right. `public static void main(String[] args)` is a shape, not just a name. Miss `static`, return `int`, or capitalise `Main`, and the class is valid but not startable." },
    { "text": "The JVM version is too old to run the class file", "correct": false, "why": "That is a real error, but it says so: `UnsupportedClassVersionError`, naming the class file version it found and the one it supports." },
    { "text": "The program threw an exception before printing anything", "correct": false, "why": "An exception thrown from `main` prints a stack trace beginning `Exception in thread \"main\"`. This message appears before any of your code runs." }
  ]
}
:::

## Practice

:::exercise greet-by-name

:::exercise first-program

:::recap
- Java compiles to *bytecode* for a virtual machine, not to machine code for
  your processor. `javac` does that; `java` runs the result.
- A `public` class must live in a file with a matching name, and every method
  lives inside some class.
- `public static void main(String[] args)` is a shape the launcher looks for.
  A class missing it compiles perfectly and cannot be started.
- Errors come from three stages, in order: the compiler rejects the source; the
  launcher cannot start the class; the program throws while running. Only the
  first and third carry line numbers, and they mean different things.
- The JVM compiles hot methods to machine code as the program runs, which is
  why Java is slow for the first few thousand iterations of anything and why
  measuring it naively gives fiction.
:::
