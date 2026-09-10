---
title: "Files and NIO"
navTitle: "Files and NIO"
summary: >-
  `Path` is a name, `Files` does the work, and `base.resolve(userInput)` will hand out `/etc/passwd` if you let it.
objectives:
  - Manipulate paths without touching the filesystem
  - Write a containment check that survives .. and absolute inputs
  - Read and write files with the Files API, closing what needs closing
  - Explain why Files throws where File returned false
status: complete
standard: java21
requires: [classpath-and-modules]
---

Java has two file APIs. `java.io.File` came first and reports failure by
returning `false`. `java.nio.file` arrived in Java 7 and reports failure by
throwing something that says what went wrong. Use the second one.

It splits the job in two: a `Path` is a **name**, manipulated without touching
the disk at all, and `Files` is a box of static methods that do the actual
input and output.

## A path is just a name

```java run title="Pure path arithmetic"
import java.nio.file.*;

public class Main {
    public static void main(String[] args) {
        Path base = Path.of("/srv/app");

        System.out.println("resolve relative:   " + base.resolve("data/x.txt"));
        System.out.println("resolveSibling:     " + base.resolve("data/x.txt").resolveSibling("y.txt"));
        System.out.println("normalize:          " + base.resolve("../lib/../etc/conf").normalize());
        System.out.println("relativize down:    " + base.relativize(Path.of("/srv/app/data/x.txt")));
        System.out.println("relativize across:  " + base.relativize(Path.of("/srv/other")));

        Path file = Path.of("a/b/c.txt");
        System.out.println("getFileName:        " + file.getFileName());
        System.out.println("getParent:          " + file.getParent());
        System.out.println("getParent of bare:  " + Path.of("c.txt").getParent());
        System.out.println("getNameCount:       " + file.getNameCount());

        System.out.println("startsWith by name: " + Path.of("/srv/app/data").startsWith(base));
        System.out.println("not by text:        " + Path.of("/srv/application").startsWith(base));
        System.out.println("equals is textual:  " + Path.of("a/./b").equals(Path.of("a/b")));
        System.out.println("after normalize:    " + Path.of("a/./b").normalize().equals(Path.of("a/b")));
    }
}
```

None of that opened a file. `Path.of` does not check anything exists, and
`normalize` removes `.` and `..` **lexically** — it does not resolve symbolic
links, which is why there is a separate `toRealPath()` that does and needs the
file to exist.

Two behaviours to keep: `startsWith` compares whole name elements, so
`/srv/application` does not start with `/srv/app` even though the text does;
and `equals` is textual, so `a/./b` is not equal to `a/b` until you normalize.

## The one that is a security bug

```java run title="resolve() with an absolute argument"
import java.nio.file.*;

public class Main {
    static Path unsafe(Path base, String userSupplied) {
        return base.resolve(userSupplied);
    }

    static Path safe(Path base, String userSupplied) {
        Path candidate = base.resolve(userSupplied).normalize();
        if (!candidate.startsWith(base)) {
            throw new IllegalArgumentException("outside the base directory: " + userSupplied);
        }
        return candidate;
    }

    public static void main(String[] args) {
        Path base = Path.of("/srv/app/uploads").normalize();
        String[] attempts = { "photo.png", "sub/photo.png", "a/../b.txt", "../../etc/passwd", "/etc/passwd" };

        System.out.println("without a check:");
        for (String attempt : attempts) {
            System.out.println("  " + attempt + "  ->  " + unsafe(base, attempt).normalize());
        }

        System.out.println("with a check:");
        for (String attempt : attempts) {
            try {
                System.out.println("  ok       " + attempt + "  ->  " + safe(base, attempt));
            } catch (IllegalArgumentException refused) {
                System.out.println("  refused  " + attempt);
            }
        }
    }
}
```

Read the first block. `base.resolve("/etc/passwd")` returns **`/etc/passwd`** —
resolving an absolute path throws the base away entirely. That is documented
behaviour and it is exactly right for a path-joining function; it is
catastrophic for anything that treats user input as a filename.

The `..` case is the one people expect and guard against. The absolute case is
the one that gets through, because a `..` filter passes it untouched.

The correct check is the three lines in `safe`: **resolve, normalize, then
verify the result is still inside the base**. Both attacks fail the same test,
and `a/../b.txt` — which goes up and comes back — is correctly allowed. Where
symlinks are a concern, use `toRealPath()` on both sides instead of
`normalize`, and accept that the file must then exist.

## Reading and writing

```java run title="The whole file, and a line at a time"
import java.io.*;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("javatb");
        try {
            Path file = dir.resolve("notes.txt");

            Files.writeString(file, "first\nsecond\nthird\n");
            System.out.println("readString:      " + Files.readString(file).replace("\n", "\\n"));
            System.out.println("readAllLines:    " + Files.readAllLines(file));
            System.out.println("size in bytes:   " + Files.size(file));

            Files.writeString(file, "fourth\n", StandardOpenOption.APPEND);
            System.out.println("after append:    " + Files.readAllLines(file));

            Files.write(dir.resolve("list.txt"), List.of("a", "b", "c"));
            System.out.println("Files.write:     " + Files.readAllLines(dir.resolve("list.txt")));

            // A stream over a file holds the file open. Close it.
            try (Stream<String> lines = Files.lines(file)) {
                System.out.println("lines starting with f: "
                    + lines.filter(line -> line.startsWith("f")).toList());
            }

            System.out.println("default charset: " + Charset.defaultCharset());
        } finally {
            deleteRecursively(dir);
            System.out.println("cleaned up:      " + Files.notExists(dir));
        }
    }

    static void deleteRecursively(Path root) throws IOException {
        try (Stream<Path> all = Files.walk(root)) {
            for (Path path : all.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
```

`readString`, `readAllLines` and `write` all read or write the whole thing and
close it for you — the right choice for configuration files and anything else
that comfortably fits in memory. Since Java 18 they default to **UTF-8**
regardless of the platform, which removed an entire genre of
works-on-my-machine bug; before that they used the platform charset, so code
older than 18 that omits the charset argument is worth checking.

`Files.lines` and `Files.walk` are different: they return a `Stream` backed by
an **open file handle**, and the garbage collector will not close it (chapter
7.1). Both are `AutoCloseable`, so both belong in a `try`-with-resources. A
program that leaks these runs fine until it hits the process's file-descriptor
limit, at which point everything fails at once and none of the stack traces
point at the leak.

## Failure that tells you something

```java run title="false, versus a sentence"
import java.io.*;
import java.nio.file.*;

public class Main {
    public static void main(String[] args) {
        File missing = new File("/definitely/not/here/notes.txt");

        System.out.println("java.io.File:");
        System.out.println("  exists()  " + missing.exists());
        System.out.println("  length()  " + missing.length());
        System.out.println("  delete()  " + missing.delete());

        System.out.println("java.nio.file.Files:");
        try {
            Files.delete(missing.toPath());
        } catch (IOException failure) {
            System.out.println("  " + failure.getClass().getSimpleName() + ": " + failure.getMessage());
        }
    }
}
```

`File.delete()` returns `false`. Was the file missing? Was the directory not
writable? Was it a non-empty directory? The API cannot say, and neither can
you. `Files.delete` throws `NoSuchFileException` — a subclass of `IOException`
that carries the path — and would have thrown `DirectoryNotEmptyException` or
`AccessDeniedException` for the other cases.

`File.length()` returning `0` for a missing file is the same failure in a
nastier costume: a plausible number where there should be an error.

The same goes for existence checks. `Files.exists(path)` is a real question
with a real answer, and the answer is stale the moment you have it — between
the check and the open, another process can create or delete the file. That is
a **time-of-check-to-time-of-use** race, and it is a security bug when the
thing in between is a permission decision. Prefer to *attempt the operation*
and handle the exception: `Files.newOutputStream(path, CREATE_NEW)` either
creates the file or throws `FileAlreadyExistsException`, atomically, which no
pair of check-then-act calls can promise.

## Copy, move, and writing safely

```java run title="An update that is never half-done"
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;

public class Main {
    /** Replaces the file's contents, or leaves the old contents completely intact. */
    static void writeAtomically(Path target, String contents) throws IOException {
        Path temporary = Files.createTempFile(target.getParent(), "tmp", ".part");
        try {
            Files.writeString(temporary, contents);
            Files.move(temporary, target,
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException failure) {
            Files.deleteIfExists(temporary);
            throw failure;
        }
    }

    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("javatb");
        try {
            Path config = dir.resolve("config.txt");

            writeAtomically(config, "version=1\n");
            System.out.println("after first write:  " + Files.readString(config).trim());

            writeAtomically(config, "version=2\n");
            System.out.println("after second write: " + Files.readString(config).trim());

            Path copy = dir.resolve("config.bak");
            Files.copy(config, copy, StandardCopyOption.REPLACE_EXISTING);
            System.out.println("copy matches:       " + Files.readString(copy).equals(Files.readString(config)));

            Files.createDirectories(dir.resolve("a/b/c"));
            Files.writeString(dir.resolve("a/b/c/deep.txt"), "x");
            try (Stream<Path> walk = Files.walk(dir)) {
                System.out.println("entries under dir:  " + walk.count());
            }
        } finally {
            try (Stream<Path> all = Files.walk(dir)) {
                for (Path path : all.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(path);
                }
            }
        }
    }
}
```

`writeAtomically` is worth committing to memory. Writing directly to `config`
means that a crash, a full disk or a killed process leaves a **truncated
configuration file** — the old contents gone and the new ones incomplete.
Writing to a temporary file in the *same directory* and then moving it means
the target is only ever the complete old version or the complete new one.

Two details make it work. The temporary file must be on the same filesystem as
the target — hence `target.getParent()` rather than the system temp directory,
because a move across filesystems is a copy and cannot be atomic.
And `ATOMIC_MOVE` is what asks for the guarantee; without it,
`REPLACE_EXISTING` alone may be implemented as delete-then-copy.

`Files.createDirectories` makes every missing parent and does not complain if
they already exist — unlike `createDirectory`, which makes one level and throws
if it is there.

## Buffering is not automatic

```java run title="Measured: eighty thousand lines"
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("javatb");
        try {
            List<String> lines = new ArrayList<>();
            for (int i = 0; i < 80_000; i++) {
                lines.add("line " + i + " with a little payload");
            }

            for (int round = 1; round <= 3; round++) {
                Path plain = dir.resolve("plain.txt");
                long start = System.nanoTime();
                try (Writer writer = new FileWriter(plain.toFile())) {
                    for (String line : lines) {
                        writer.write(line);
                        writer.write('\n');
                    }
                }
                long plainMs = (System.nanoTime() - start) / 1_000_000;

                Path buffered = dir.resolve("buffered.txt");
                start = System.nanoTime();
                try (Writer writer = new BufferedWriter(new FileWriter(buffered.toFile()))) {
                    for (String line : lines) {
                        writer.write(line);
                        writer.write('\n');
                    }
                }
                long bufferedMs = (System.nanoTime() - start) / 1_000_000;

                Path viaFiles = dir.resolve("files.txt");
                start = System.nanoTime();
                Files.write(viaFiles, lines);
                long filesMs = (System.nanoTime() - start) / 1_000_000;

                System.out.println("round " + round
                    + ":  FileWriter " + plainMs + " ms"
                    + "   BufferedWriter " + bufferedMs + " ms"
                    + "   Files.write " + filesMs + " ms"
                    + "   identical size: "
                    + (Files.size(plain) == Files.size(buffered)
                        && Files.size(buffered) == Files.size(viaFiles)));
            }
        } finally {
            try (Stream<Path> all = Files.walk(dir)) {
                for (Path path : all.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(path);
                }
            }
        }
    }
}
```

Warm: **FileWriter 25–30 ms, BufferedWriter 5–13 ms, `Files.write` 6–9 ms** —
two to five times, for one wrapper. `FileWriter` has a small internal encoding
buffer, so it is not as bad as a truly unbuffered stream, and it is still the
slowest of the three every round.

(Eighty thousand lines rather than a million because this book's runner caps
the size of a file a program may create. Real code writing gigabytes sees the
same ratio, more emphatically.)

The rule: wrap a stream or writer in its buffered counterpart, or use the
`Files` methods, which do it for you. `Files.newBufferedReader` and
`Files.newBufferedWriter` are the ones to reach for when the file is too large
to hold in memory.

:::quiz
{
  "question": "A file server does `uploadsDir.resolve(request.getFilename())` and rejects any filename containing `\"..\"`. What still gets through?",
  "options": [
    { "text": "An absolute path — `resolve(\"/etc/passwd\")` discards the base entirely and returns `/etc/passwd`", "correct": true, "why": "Right, and it contains no `..` so the filter passes it untouched. The fix is to normalize and then check `startsWith(base)`." },
    { "text": "Nothing — rejecting `..` is sufficient for a path built with resolve", "correct": false, "why": "It handles the traversal case and misses the absolute one; `resolve` is documented to return its argument when that argument is absolute." },
    { "text": "A filename with a trailing slash, which makes resolve return the parent", "correct": false, "why": "A trailing separator is insignificant; resolve returns the same path either way." },
    { "text": "A very long filename, which overflows the path buffer", "correct": false, "why": "Java paths are String-based objects with no fixed buffer; an over-long name fails at the filesystem, not silently." }
  ]
}
:::

## Practice

:::exercise safe-paths

:::exercise line-index

:::recap
- `Path` is a name and does no I/O. `resolve`, `normalize`, `relativize`,
  `getParent` and `startsWith` are all pure; `toRealPath` is the one that
  touches the disk.
- `base.resolve(absolutePath)` returns the absolute path and drops the base.
  Containment means **resolve, normalize, `startsWith(base)`** — a `..` filter
  is not enough.
- `Files.readString`, `readAllLines` and `write` handle the whole file and
  close it. Since Java 18 they default to UTF-8.
- `Files.lines` and `Files.walk` return streams holding an open file handle —
  always in a `try`-with-resources.
- `Files` throws `NoSuchFileException`, `AccessDeniedException`,
  `DirectoryNotEmptyException`; `File` returns `false` and `0`. Prefer to
  attempt and catch rather than check and act.
- Update a file by writing a temporary in the same directory and
  `Files.move` with `ATOMIC_MOVE`, so a crash never leaves it half-written.
- Buffering is not automatic: measured at two to five times over eighty
  thousand lines.
