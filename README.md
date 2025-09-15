<div align="center">
  <img src="assets/lumen.png" alt="Lumen Logo" width="150"/>
  <h1>Lumen</h1>
  <p>
    A modern, statically-typed functional programming language.
  </p>
</div>

Lumen is a functional programming language designed for clarity, safety, and expressiveness. It brings modern language features into a simple and concise syntax, making it easy to build robust and maintainable software.

> [!IMPORTANT]  
> Lumen is a personal project, created primarily for my own professional fulfillment and learning.  
> The goal is not to create the fastest, safest, or most feature-rich language, but rather to explore language design and interpreter implementation. Please consider it an experimental language.

## Features

Lumen is built on a foundation of powerful concepts inspired by languages like Rust, Elm, and F#.

- **Static Typing**: A strong type system catches errors at compile time, not runtime.
- **Immutability by Default**: Encourages a functional style and makes code more predictable. Variables are immutable unless explicitly marked with `mut`.
- **Rich Type System**: Includes expressive algebraic data types like `Records` (structs) and `Sum Types` (tagged unions) for precise data modeling.
- **Powerful Pattern Matching**: Exhaustively match against Sum Types, arrays, and other structures for safe and readable control flow.
- **Traits for Abstraction**: Define shared behavior across different types using traits, similar to interfaces.
- **First-Class Functions**: Use higher-order functions, create closures, and pass functions as arguments.
- **Pipe Operator (`|>`**): Chain functions together in a clean, readable, left-to-right flow.
- **Result-Based Error Handling**: Functions that can fail return a `Result<Ok, Err>` type, ensuring that errors are handled explicitly.

## Getting Started

To run a Lumen program, use the Lumen executable and provide the path to your entry file.

```bash
# Execute a file
./bin/lumen examples/1-basics/01-variables-and-types.lu
```

### Example: Hello, World\!

```rust
// main.lu

let main = () => {
  writeln("Hello, Lumen!");
};

main();
```

## Standard Library

Lumen comes with a useful standard library to handle common tasks, including:

- `fs`: File system operations.
- `net.http`: Building HTTP servers.
- `json`: Parsing and serializing JSON data.
- `math`: Common mathematical functions.
- `string`: String manipulation utilities.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
