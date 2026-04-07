import { seededShuffle } from "@/lib/seededShuffle";

export interface Question {
  id: string;
  text: string;
  type: "mcq" | "short_answer" | "true_false" | "problem_solving";
  options?: string[];
  correctAnswer: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  day: number;
}

export const questionBank: Question[] = [
  // Day 1 — MCQ
  { id: "d1q1", text: "What is the output of `print(type(3.14))`?", type: "mcq", options: ["<class 'int'>", "<class 'float'>", "<class 'str'>", "<class 'number'>"], correctAnswer: "<class 'float'>", topic: "Variables & Types", difficulty: "Easy", day: 1 },
  { id: "d1q2", text: "Which keyword is used to define a function in Python?", type: "mcq", options: ["function", "def", "func", "define"], correctAnswer: "def", topic: "Functions", difficulty: "Easy", day: 1 },
  { id: "d1q3", text: "What does `len([1, 2, 3])` return?", type: "mcq", options: ["2", "3", "4", "Error"], correctAnswer: "3", topic: "Lists & Dicts", difficulty: "Easy", day: 1 },
  { id: "d1q4", text: "Which of the following is a valid variable name in Python?", type: "mcq", options: ["2name", "my-var", "_count", "class"], correctAnswer: "_count", topic: "Variables & Types", difficulty: "Easy", day: 1 },
  { id: "d1q5", text: "What is the result of `10 // 3` in Python?", type: "mcq", options: ["3.33", "3", "4", "3.0"], correctAnswer: "3", topic: "Variables & Types", difficulty: "Medium", day: 1 },
  { id: "d1q6", text: "What does the `range(5)` function generate?", type: "mcq", options: ["[1, 2, 3, 4, 5]", "[0, 1, 2, 3, 4]", "[0, 1, 2, 3, 4, 5]", "[1, 2, 3, 4]"], correctAnswer: "[0, 1, 2, 3, 4]", topic: "Control Flow", difficulty: "Easy", day: 1 },
  { id: "d1q7", text: "Which operator is used for exponentiation in Python?", type: "mcq", options: ["^", "**", "//", "%%"], correctAnswer: "**", topic: "Variables & Types", difficulty: "Easy", day: 1 },
  { id: "d1q8", text: "What will `bool('')` return?", type: "mcq", options: ["True", "False", "None", "Error"], correctAnswer: "False", topic: "Variables & Types", difficulty: "Medium", day: 1 },
  { id: "d1q9", text: "What is the correct way to create a dictionary?", type: "mcq", options: ["d = [1: 'a']", "d = {1: 'a'}", "d = (1: 'a')", "d = <1: 'a'>"], correctAnswer: "d = {1: 'a'}", topic: "Lists & Dicts", difficulty: "Easy", day: 1 },
  { id: "d1q10", text: "What keyword exits a loop early in Python?", type: "mcq", options: ["stop", "exit", "break", "return"], correctAnswer: "break", topic: "Control Flow", difficulty: "Easy", day: 1 },

  // Day 1 — Short Answer
  { id: "d1sa1", text: "What built-in function converts a string to an integer in Python?", type: "short_answer", correctAnswer: "int", topic: "Variables & Types", difficulty: "Easy", day: 1 },
  { id: "d1sa2", text: "What symbol is used to start a single-line comment in Python?", type: "short_answer", correctAnswer: "#", topic: "Variables & Types", difficulty: "Easy", day: 1 },
  { id: "d1sa3", text: "What keyword is used to create a loop that iterates over a sequence?", type: "short_answer", correctAnswer: "for", topic: "Control Flow", difficulty: "Easy", day: 1 },

  // Day 1 — Problem Solving
  { id: "d1ps1", text: "Write a Python expression that calculates the remainder when 17 is divided by 5.", type: "problem_solving", correctAnswer: "17 % 5", topic: "Variables & Types", difficulty: "Easy", day: 1 },
  { id: "d1ps2", text: "Write a list comprehension that creates a list of squares for numbers 1 through 5.\nExample output: [1, 4, 9, 16, 25]", type: "problem_solving", correctAnswer: "[x**2 for x in range(1, 6)]", topic: "Lists & Dicts", difficulty: "Medium", day: 1 },

  // Day 2 — MCQ
  { id: "d2q1", text: "What does `'hello'.upper()` return?", type: "mcq", options: ["'Hello'", "'HELLO'", "'hello'", "Error"], correctAnswer: "'HELLO'", topic: "Variables & Types", difficulty: "Easy", day: 2 },
  { id: "d2q2", text: "Which method adds an element to the end of a list?", type: "mcq", options: ["add()", "insert()", "append()", "push()"], correctAnswer: "append()", topic: "Lists & Dicts", difficulty: "Easy", day: 2 },
  { id: "d2q3", text: "What is a lambda function?", type: "mcq", options: ["A named function", "An anonymous one-line function", "A built-in function", "A recursive function"], correctAnswer: "An anonymous one-line function", topic: "Functions", difficulty: "Medium", day: 2 },
  { id: "d2q4", text: "What does `try...except` do in Python?", type: "mcq", options: ["Loops code", "Defines a class", "Handles exceptions", "Imports modules"], correctAnswer: "Handles exceptions", topic: "Error Handling", difficulty: "Easy", day: 2 },
  { id: "d2q5", text: "What is the output of `[x*2 for x in range(3)]`?", type: "mcq", options: ["[0, 1, 2]", "[2, 4, 6]", "[0, 2, 4]", "[1, 2, 3]"], correctAnswer: "[0, 2, 4]", topic: "Lists & Dicts", difficulty: "Medium", day: 2 },
  { id: "d2q6", text: "Which file mode opens a file for reading only?", type: "mcq", options: ["'w'", "'r'", "'a'", "'x'"], correctAnswer: "'r'", topic: "File Handling", difficulty: "Easy", day: 2 },
  { id: "d2q7", text: "What does `import os` do?", type: "mcq", options: ["Creates a file", "Imports the os module", "Runs the operating system", "Deletes a file"], correctAnswer: "Imports the os module", topic: "Modules", difficulty: "Easy", day: 2 },
  { id: "d2q8", text: "What is the purpose of `self` in a Python class?", type: "mcq", options: ["Refers to the class", "Refers to the current instance", "Creates a new object", "Deletes the object"], correctAnswer: "Refers to the current instance", topic: "OOP Basics", difficulty: "Medium", day: 2 },
  { id: "d2q9", text: "What does `dict.get('key', 'default')` do?", type: "mcq", options: ["Raises KeyError if missing", "Returns None always", "Returns 'default' if key missing", "Deletes the key"], correctAnswer: "Returns 'default' if key missing", topic: "Lists & Dicts", difficulty: "Medium", day: 2 },
  { id: "d2q10", text: "What is the result of `not True`?", type: "mcq", options: ["True", "False", "None", "Error"], correctAnswer: "False", topic: "Control Flow", difficulty: "Easy", day: 2 },

  // Day 2 — Short Answer
  { id: "d2sa1", text: "What method removes the last element from a list and returns it?", type: "short_answer", correctAnswer: "pop", topic: "Lists & Dicts", difficulty: "Easy", day: 2 },
  { id: "d2sa2", text: "What keyword is used to handle a specific exception type in a try block?", type: "short_answer", correctAnswer: "except", topic: "Error Handling", difficulty: "Easy", day: 2 },
  { id: "d2sa3", text: "What built-in function returns the number of items in a dictionary?", type: "short_answer", correctAnswer: "len", topic: "Lists & Dicts", difficulty: "Easy", day: 2 },

  // Day 2 — Problem Solving
  { id: "d2ps1", text: "Write a function definition (just the first line) for a function called `greet` that takes a parameter `name`.", type: "problem_solving", correctAnswer: "def greet(name):", topic: "Functions", difficulty: "Easy", day: 2 },
  { id: "d2ps2", text: "Write a try-except block that catches a ValueError when converting user input to an integer.\n\nHint: Use `int(input())` inside the try block.", type: "problem_solving", correctAnswer: "try:\n    int(input())\nexcept ValueError:\n    pass", topic: "Error Handling", difficulty: "Medium", day: 2 },

  // Day 3 / Exam — MCQ
  { id: "d3q1", text: "What design pattern does Python's `with` statement implement?", type: "mcq", options: ["Singleton", "Observer", "Context Manager", "Factory"], correctAnswer: "Context Manager", topic: "File Handling", difficulty: "Hard", day: 3 },
  { id: "d3q2", text: "What is the difference between `==` and `is` in Python?", type: "mcq", options: ["No difference", "`==` checks value, `is` checks identity", "`is` checks value, `==` checks identity", "`is` is for strings only"], correctAnswer: "`==` checks value, `is` checks identity", topic: "Variables & Types", difficulty: "Hard", day: 3 },
  { id: "d3q3", text: "What does `*args` do in a function definition?", type: "mcq", options: ["Unpacks a dictionary", "Accepts variable positional arguments", "Makes arguments optional", "Creates a generator"], correctAnswer: "Accepts variable positional arguments", topic: "Functions", difficulty: "Medium", day: 3 },
  { id: "d3q4", text: "What is a decorator in Python?", type: "mcq", options: ["A comment style", "A function that modifies another function", "A type of loop", "A class attribute"], correctAnswer: "A function that modifies another function", topic: "Functions", difficulty: "Hard", day: 3 },
  { id: "d3q5", text: "Which method makes a class iterable?", type: "mcq", options: ["__init__", "__str__", "__iter__", "__call__"], correctAnswer: "__iter__", topic: "OOP Basics", difficulty: "Hard", day: 3 },
  { id: "d3q6", text: "What is the time complexity of looking up a key in a Python dictionary?", type: "mcq", options: ["O(n)", "O(log n)", "O(1) average", "O(n²)"], correctAnswer: "O(1) average", topic: "Lists & Dicts", difficulty: "Hard", day: 3 },
  { id: "d3q7", text: "What is the output of `print([1,2,3] + [4,5])`?", type: "mcq", options: ["[5, 7, 3]", "[1, 2, 3, 4, 5]", "Error", "[[1,2,3],[4,5]]"], correctAnswer: "[1, 2, 3, 4, 5]", topic: "Lists & Dicts", difficulty: "Easy", day: 3 },
  { id: "d3q8", text: "Which exception is raised when dividing by zero?", type: "mcq", options: ["ValueError", "TypeError", "ZeroDivisionError", "ArithmeticError"], correctAnswer: "ZeroDivisionError", topic: "Error Handling", difficulty: "Medium", day: 3 },
  { id: "d3q9", text: "What does `__init__` do in a Python class?", type: "mcq", options: ["Destroys the object", "Initializes a new instance", "Prints the object", "Compares objects"], correctAnswer: "Initializes a new instance", topic: "OOP Basics", difficulty: "Easy", day: 3 },
  { id: "d3q10", text: "What will `list(set([1, 2, 2, 3, 3]))` produce?", type: "mcq", options: ["[1, 2, 2, 3, 3]", "[1, 2, 3]", "Error", "{1, 2, 3}"], correctAnswer: "[1, 2, 3]", topic: "Lists & Dicts", difficulty: "Medium", day: 3 },
  { id: "d3q11", text: "What is a generator in Python?", type: "mcq", options: ["A type of list", "A function that uses yield", "A class decorator", "A module"], correctAnswer: "A function that uses yield", topic: "Functions", difficulty: "Hard", day: 3 },
  { id: "d3q12", text: "Which keyword is used for inheritance?", type: "mcq", options: ["extends", "inherits", "class Child(Parent):", "import Parent"], correctAnswer: "class Child(Parent):", topic: "OOP Basics", difficulty: "Medium", day: 3 },
  { id: "d3q13", text: "What does `enumerate()` return?", type: "mcq", options: ["Only values", "Only indices", "Index-value pairs", "A dictionary"], correctAnswer: "Index-value pairs", topic: "Control Flow", difficulty: "Medium", day: 3 },
  { id: "d3q14", text: "What is the purpose of `if __name__ == '__main__':`?", type: "mcq", options: ["Imports the module", "Runs code only when file is executed directly", "Defines main function", "Catches errors"], correctAnswer: "Runs code only when file is executed directly", topic: "Modules", difficulty: "Medium", day: 3 },
  { id: "d3q15", text: "What does `json.loads()` do?", type: "mcq", options: ["Writes JSON to file", "Parses a JSON string into Python object", "Converts Python to JSON string", "Validates JSON schema"], correctAnswer: "Parses a JSON string into Python object", topic: "Modules", difficulty: "Medium", day: 3 },

  // Day 3 / Exam — Short Answer
  { id: "d3sa1", text: "What keyword is used to yield values from a generator function?", type: "short_answer", correctAnswer: "yield", topic: "Functions", difficulty: "Medium", day: 3 },
  { id: "d3sa2", text: "What dunder method is called when you use `print()` on an object?", type: "short_answer", correctAnswer: "__str__", topic: "OOP Basics", difficulty: "Medium", day: 3 },
  { id: "d3sa3", text: "What module do you import to work with JSON data in Python?", type: "short_answer", correctAnswer: "json", topic: "Modules", difficulty: "Easy", day: 3 },
  { id: "d3sa4", text: "What is the name of the method that initializes a new object in a class?", type: "short_answer", correctAnswer: "__init__", topic: "OOP Basics", difficulty: "Easy", day: 3 },

  // Day 3 / Exam — Problem Solving
  { id: "d3ps1", text: "Write a Python function called `is_even` that takes a number and returns True if it's even, False otherwise.\n\nProvide the complete function definition.", type: "problem_solving", correctAnswer: "def is_even(n):\n    return n % 2 == 0", topic: "Functions", difficulty: "Easy", day: 3 },
  { id: "d3ps2", text: "Write a dictionary comprehension that maps each number from 1 to 5 to its square.\nExpected result: {1: 1, 2: 4, 3: 9, 4: 16, 5: 25}", type: "problem_solving", correctAnswer: "{x: x**2 for x in range(1, 6)}", topic: "Lists & Dicts", difficulty: "Medium", day: 3 },
  { id: "d3ps3", text: "Write a class called `Dog` with an `__init__` method that takes `name` and `breed` parameters and stores them as instance attributes.", type: "problem_solving", correctAnswer: "class Dog:\n    def __init__(self, name, breed):\n        self.name = name\n        self.breed = breed", topic: "OOP Basics", difficulty: "Medium", day: 3 },
  { id: "d3ps4", text: "Write a Python function called `count_vowels` that takes a string and returns the number of vowels (a, e, i, o, u) in it.", type: "problem_solving", correctAnswer: "def count_vowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')", topic: "Functions", difficulty: "Hard", day: 3 },
];

// Map question mix settings to allowed types
const mixToTypes: Record<string, Question["type"][]> = {
  mixed: ["mcq", "short_answer", "problem_solving"],
  mcq_only: ["mcq"],
  short_answer: ["short_answer"],
  problem_solving: ["problem_solving"],
  mcq_short: ["mcq", "short_answer"],
  mcq_problem: ["mcq", "problem_solving"],
};

export const getQuizQuestions = (day: number, count: number, seed?: string): Question[] => {
  const dayQuestions = questionBank.filter(q => q.day === day);
  if (seed) {
    return seededShuffle(dayQuestions, seed).slice(0, Math.min(count, dayQuestions.length));
  }
  const shuffled = [...dayQuestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};

export const getExamQuestions = (count: number, seed?: string, questionMix?: string): Question[] => {
  const allowedTypes = mixToTypes[questionMix || "mixed"] || mixToTypes.mixed;
  const filtered = questionBank.filter(q => allowedTypes.includes(q.type));
  const pool = filtered.length > 0 ? filtered : questionBank;

  if (seed) {
    return seededShuffle(pool, seed).slice(0, Math.min(count, pool.length));
  }
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
