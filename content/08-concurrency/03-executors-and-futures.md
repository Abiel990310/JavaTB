---
title: "Executors and futures"
navTitle: "Executors"
summary: >-
  Stop creating threads. Submit tasks to a pool, hold a Future, and know which of the two submit methods silently eats your exceptions.
objectives:
  - Submit tasks to an ExecutorService and collect results
  - Explain why submit hides an exception that execute reports
  - Shut a pool down properly, including with try-with-resources
  - Compose asynchronous work with CompletableFuture
status: complete
standard: java21
requires: [the-memory-model]
---

Chapter 8.1 created threads by hand to make the mechanics visible. Do not do
that in real code. A thread is an expensive operating-system resource with a
megabyte of stack, and creating one per task means the cost of creation scales
with the work while the benefit does not.

An **executor** separates the two ideas that `new Thread(task).start()`
conflates: *what to do* and *where to run it*.

## Submit and collect

```java run title="A pool, a Future, an answer"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
            Future<Integer> answer = pool.submit(() -> 6 * 7);
            System.out.println("submitted; done yet? " + answer.isDone());
            System.out.println("get() -> " + answer.get());

            List<Callable<String>> tasks = List.of(
                () -> "alpha",
                () -> "beta",
                () -> "gamma");

            List<String> results = new ArrayList<>();
            for (Future<String> future : pool.invokeAll(tasks)) {
                results.add(future.get());
            }
            System.out.println("invokeAll -> " + results);
            System.out.println("invokeAny -> " + pool.invokeAny(tasks));
        }
        System.out.println("pool closed and all tasks finished");
    }
}
```

`submit` takes a `Callable<T>` — like a `Runnable` but it returns a value and
may throw a checked exception — and hands back a `Future<T>`. `get()` blocks
until the answer exists, then returns it.

`invokeAll` submits a batch and blocks until every one has finished; the
futures come back in the order of the input, not the order of completion.
`invokeAny` returns the first successful result and cancels the rest — so run
the program twice and that last line may print a different word. Any of the
three is a correct answer, which is the shape of the guarantee.

Since Java 19 an `ExecutorService` is `AutoCloseable`, and `close()` means
"shut down, then wait for the tasks to finish" — so `try`-with-resources is now
the right shape, and the older three-line dance is not needed:

```java
pool.shutdown();
if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
    pool.shutdownNow();
}
```

You still need that form when you want a timeout or an escalation.
`shutdown()` refuses new tasks and lets running ones finish; `shutdownNow()`
also interrupts what is running and returns the queue of tasks that never
started. Neither one forces anything to stop: a task that ignores interruption
runs to completion regardless.

## The exception you never see

```java run title="execute reports, submit hides"
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BlockingQueue<String> handled = new LinkedBlockingQueue<>();
        Thread.setDefaultUncaughtExceptionHandler(
            (thread, failure) -> handled.add(failure.getMessage()));

        try (ExecutorService pool = Executors.newFixedThreadPool(1)) {
            pool.execute(() -> {
                throw new IllegalStateException("from execute");
            });
        }
        System.out.println("execute -> handler saw: " + handled.poll(5, TimeUnit.SECONDS));

        Future<?> future;
        try (ExecutorService pool = Executors.newFixedThreadPool(1)) {
            future = pool.submit(() -> {
                throw new IllegalStateException("from submit");
            });
        }
        System.out.println("submit  -> handler saw: " + handled.poll(300, TimeUnit.MILLISECONDS));
        System.out.println("           future.isDone(): " + future.isDone());

        try {
            future.get();
        } catch (ExecutionException wrapped) {
            System.out.println("           get() reveals:   " + wrapped.getCause());
        }
    }
}
```

`execute` runs the task like a thread's `run`, so an exception reaches the
thread's uncaught-exception handler and, by default, prints a stack trace.
`submit` **captures** the exception into the `Future` — nothing is printed,
nothing is logged, and `isDone()` is `true` as though all were well. The
failure exists only inside a `Future` that many callers never look at.

This is the single most common way for work to disappear in a Java service:
`pool.submit(this::processBatch)` with the returned `Future` dropped on the
floor. Either keep the future and call `get()`, or wrap the task body in a
`try`/`catch` that logs, or use `execute` when you genuinely have no result to
collect.

`get()` wraps whatever the task threw in an `ExecutionException`; the real
failure is `getCause()`, exactly as with reflection in chapter 7.4.

## Sizing, and a deadlock you can cause yourself

```java run title="One thread, two dependent tasks"
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws Exception {
        ExecutorService single = Executors.newFixedThreadPool(1);

        Future<String> outer = single.submit(() -> {
            Future<String> inner = single.submit(() -> "inner finished");
            return inner.get(1, TimeUnit.SECONDS);
        });

        try {
            System.out.println("outer -> " + outer.get(3, TimeUnit.SECONDS));
        } catch (ExecutionException failure) {
            System.out.println("outer failed with " + failure.getCause().getClass().getSimpleName());
        }

        single.shutdownNow();
        System.out.println("available processors: " + Runtime.getRuntime().availableProcessors());
        System.out.println("common pool parallelism: " + ForkJoinPool.getCommonPoolParallelism());
    }
}
```

The outer task occupies the pool's only thread and then waits for a task that
cannot start until that thread is free. Nothing is deadlocked in the JVM's
sense — no monitor is held — but the work never completes. This is **thread
starvation deadlock**, and it is why a task that submits to its own pool and
waits is a design error rather than an inefficiency.

Sizing a pool is a two-case rule:

- **CPU-bound work**: about `availableProcessors()` threads. More does not
  help; there is no more processor to use.
- **Blocking work** (network, disk, database): more, because most threads are
  waiting rather than computing. The classic estimate is
  `processors × (1 + waitTime / computeTime)`, which is a starting point to
  measure from, not an answer.

`Executors.newCachedThreadPool()` grows without limit and is a liability under
load — a burst of ten thousand tasks becomes ten thousand threads.
`newFixedThreadPool` bounds it, and a bounded queue plus a rejection policy
bounds it further.

Note the last line: the **common pool** used by parallel streams and
`CompletableFuture` has `availableProcessors() - 1` threads, because the
submitting thread helps out. On a machine with four cores, that is three.

## Composing with `CompletableFuture`

`Future.get()` blocks, which means a chain of dependent calls blocks a thread
per step. `CompletableFuture` lets you describe the chain instead:

```java run title="Chains, combinations and recovery"
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        CompletableFuture<Integer> chain = CompletableFuture
            .supplyAsync(() -> 20)
            .thenApply(value -> value + 1)
            .thenCombine(CompletableFuture.supplyAsync(() -> 21), Integer::sum);

        System.out.println("combined:  " + chain.join());

        CompletableFuture<String> recovered = CompletableFuture
            .<String>supplyAsync(() -> {
                throw new IllegalStateException("service unavailable");
            })
            .exceptionally(failure -> "fallback after: " + failure.getCause().getMessage());

        System.out.println("recovered: " + recovered.join());

        try {
            CompletableFuture.supplyAsync(() -> {
                throw new IllegalStateException("service unavailable");
            }).join();
        } catch (CompletionException wrapped) {
            System.out.println("join threw " + wrapped.getClass().getSimpleName()
                + " caused by " + wrapped.getCause().getClass().getSimpleName());
        }

        CompletableFuture<String> composed = CompletableFuture
            .supplyAsync(() -> "user-42")
            .thenCompose(id -> CompletableFuture.supplyAsync(() -> "profile of " + id));

        System.out.println("composed:  " + composed.join());
    }
}
```

The four operations to learn first:

- `thenApply` — transform the result. `map`.
- `thenCompose` — the next step *is itself* a `CompletableFuture`.
  `flatMap`. Using `thenApply` here would give you a
  `CompletableFuture<CompletableFuture<T>>`.
- `thenCombine` — wait for two independent futures and merge them.
- `exceptionally` / `handle` — recover from a failure.

`join()` is `get()` without the checked exception; it throws an unchecked
`CompletionException` instead. Both wrap the original failure in `getCause()`.

Every `thenX` has a `thenXAsync` variant that runs the step on a pool rather
than on whichever thread completed the previous stage. That matters more than
it sounds: without `Async`, a slow `thenApply` runs on the thread that
completed the previous stage, which may be a common-pool thread shared with
every parallel stream in the JVM.

## What to reach for

- A batch of independent tasks whose results you need — `invokeAll`.
- Fire-and-forget work with no result — `execute`, and handle exceptions
  inside the task.
- One task whose result you need later — `submit`, keep the `Future`, and
  actually call `get()`.
- A pipeline of dependent asynchronous steps — `CompletableFuture`.
- Anything periodic — `ScheduledExecutorService`.
- Ten thousand mostly-blocked tasks — chapter 8.5's virtual threads, which
  change the sizing advice above completely.

:::quiz
{
  "question": "`pool.submit(this::processBatch)` throws inside `processBatch`, and the returned `Future` is ignored. What happens?",
  "options": [
    { "text": "Nothing visible — the exception is stored in the Future, no handler runs and nothing is printed", "correct": true, "why": "Right, and it is the commonest way for work to vanish silently in a Java service. `execute` would have reported it." },
    { "text": "The default uncaught-exception handler prints a stack trace, as with a plain thread", "correct": false, "why": "That is what `execute` does. `submit` catches the throwable and completes the Future exceptionally instead." },
    { "text": "The pool shuts down, since a worker thread died", "correct": false, "why": "The worker does not die — the exception never escapes the task wrapper — and the pool carries on." },
    { "text": "The exception is rethrown on the submitting thread at the next submit call", "correct": false, "why": "Failures are never transferred to another thread implicitly; the Future is the only place it exists." }
  ]
}
:::

## Practice

:::exercise pool-the-work

:::exercise async-pipeline

:::recap
- An executor separates the task from the thread. Do not create threads per
  task.
- `submit` takes a `Callable`, returns a `Future`, and **swallows exceptions**
  into it; `execute` lets them reach the uncaught-exception handler. `get()`
  wraps the failure in `ExecutionException`.
- `ExecutorService` is `AutoCloseable` since Java 19, so
  `try`-with-resources shuts down and waits. Use the explicit
  `shutdown`/`awaitTermination`/`shutdownNow` form when you need a timeout.
- A task that submits to its own pool and waits can starve it — a
  single-threaded pool deadlocks on itself.
- Size CPU-bound pools near `availableProcessors()`; blocking pools larger,
  by measurement. Avoid unbounded `newCachedThreadPool` under load.
- `CompletableFuture`: `thenApply` to map, `thenCompose` to flat-map,
  `thenCombine` to merge two, `exceptionally` to recover. `join` throws an
  unchecked `CompletionException`.
- The common pool has `availableProcessors() - 1` threads and is shared by
  everything in the JVM.
