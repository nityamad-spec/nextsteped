import { ChatMessage, ConceptTopic, ContentItem, Course, DashboardMetrics, QuizQuestion, SyllabusRecommendation, TASettings } from "@/types";

export const mockCourse: Course = {
  id: "py101",
  name: "Intro to Python",
  term: "First Semester",
  sections: ["Section A", "Section B"],
  objectives: [
    "Understand Python fundamentals and data types",
    "Master control flow and functions",
    "Learn file handling and basic data structures",
    "Understand object-oriented programming basics",
  ],
  enrollmentCode: "NEXTPY101",
  syllabusUploaded: true,
  materialsUploaded: true,
  published: true,
  startDate: "2025-08-25",
  endDate: "2025-12-15",
};

export const mockTopics: ConceptTopic[] = [
  { id: "t1", name: "Variables & Data Types", module: "Module 1: Fundamentals", prerequisites: [], confidence: "High", mastery: 85 },
  { id: "t2", name: "Control Flow", module: "Module 1: Fundamentals", prerequisites: ["t1"], confidence: "High", mastery: 78 },
  { id: "t3", name: "Functions", module: "Module 2: Functions & Modules", prerequisites: ["t1"], confidence: "Medium", mastery: 62 },
  { id: "t4", name: "Lists & Dictionaries", module: "Module 2: Data Structures", prerequisites: ["t3"], confidence: "Low", mastery: 45 },
  { id: "t5", name: "File Handling", module: "Module 3: I/O", prerequisites: ["t3"], confidence: "Medium", mastery: 58 },
  { id: "t6", name: "OOP Basics", module: "Module 4: OOP", prerequisites: ["t1", "t3"], confidence: "Low", mastery: 38 },
  { id: "t7", name: "Error Handling", module: "Module 4: Robustness", prerequisites: ["t3"], confidence: "Low", mastery: 30 },
  { id: "t8", name: "Modules & Packages", module: "Module 3: Modules", prerequisites: ["t3"], confidence: "Medium", mastery: 55 },
];

export const mockQuizQuestions: QuizQuestion[] = [
  {
    id: "q1", question: "What is the output of print(type(3.14)) in Python?", topic: "Variables & Data Types",
    options: ["<class 'float'>", "<class 'int'>", "<class 'str'>", "<class 'double'>"],
    correctIndex: 0, difficulty: "Easy", explanation: "3.14 is a floating-point number, so type() returns <class 'float'>.",
  },
  {
    id: "q2", question: "Which loop is best when you know the number of iterations?", topic: "Control Flow",
    options: ["while loop", "for loop", "do-while loop", "repeat loop"],
    correctIndex: 1, difficulty: "Medium", explanation: "A for loop is ideal when the number of iterations is known in advance.",
  },
  {
    id: "q3", question: "What does the 'return' statement do in a function?", topic: "Functions",
    options: ["Exits the function and returns a value", "Prints a value", "Loops the function", "Imports a module"],
    correctIndex: 0, difficulty: "Hard", explanation: "The return statement exits the function and optionally passes back a value to the caller.",
  },
  {
    id: "q4", question: "How do you access the value associated with key 'name' in a dictionary d?", topic: "Lists & Dictionaries",
    options: ["d['name']", "d.name", "d(name)", "d->name"],
    correctIndex: 0, difficulty: "Medium", explanation: "Dictionary values are accessed using square bracket notation with the key.",
  },
  {
    id: "q5", question: "Which keyword is used to handle exceptions in Python?", topic: "Error Handling",
    options: [
      "try/except",
      "catch/throw",
      "handle/error",
      "check/rescue",
    ],
    correctIndex: 0, difficulty: "Hard", explanation: "Python uses try/except blocks to handle exceptions.",
  },
  {
    id: "q6", question: "What is the correct way to open a file for reading in Python?", topic: "File Handling",
    options: [
      "open('file.txt', 'r')",
      "open('file.txt', 'w')",
      "read('file.txt')",
      "file.open('file.txt')",
    ],
    correctIndex: 0, difficulty: "Easy", explanation: "open() with 'r' mode opens a file for reading.",
  },
  {
    id: "q7", question: "What is __init__ in a Python class?", topic: "OOP Basics",
    options: ["Constructor method", "Destructor method", "Static method", "Class method"],
    correctIndex: 0, difficulty: "Medium", explanation: "__init__ is the constructor method called when an object is instantiated.",
  },
];

export const mockSyllabusRecommendations: SyllabusRecommendation[] = [
  {
    id: "r1", category: "Industry Alignment",
    original: "Introduction to variables and data types",
    suggestion: "Add real-world data processing examples using pandas basics as application of Python fundamentals",
    reason: "Bridges academic concepts with industry practices in data science", accepted: null,
  },
  {
    id: "r2", category: "Experiential Learning",
    original: "Functions lecture",
    suggestion: "Add hands-on lab: build a simple calculator using functions",
    reason: "Active coding reinforces theoretical concepts and builds practical skills", accepted: null,
  },
  {
    id: "r3", category: "Assessment Improvement",
    original: "Written exam on file handling",
    suggestion: "Replace with project-based assessment: build a simple file organizer script",
    reason: "Project work demonstrates deeper understanding than memorization", accepted: null,
  },
  {
    id: "r4", category: "Modern Topics",
    original: "Traditional I/O coverage",
    suggestion: "Include API calls and JSON handling alongside traditional file I/O",
    reason: "Students need exposure to modern data interchange formats used in industry", accepted: null,
  },
];

export const mockContentItems: ContentItem[] = [
  { id: "c1", type: "concept", title: "Variables & Data Types", content: "Python has several built-in data types: int, float, str, bool, list, tuple, dict, set. Variables are dynamically typed.", topic: "Variables & Data Types", difficulty: "Easy", approved: true, flagged: false },
  { id: "c2", type: "concept", title: "For Loops", content: "For loops iterate over sequences (lists, strings, ranges). Use 'for item in iterable:' syntax.", topic: "Control Flow", difficulty: "Medium", approved: true, flagged: false },
  { id: "c3", type: "practice", title: "Build a Calculator", content: "Write a program that takes two numbers and an operator, then performs the calculation using functions.", topic: "Functions", difficulty: "Medium", approved: false, flagged: false },
  { id: "c4", type: "practice", title: "List Comprehension Exercise", content: "Use list comprehensions to filter and transform data from a given list.", topic: "Lists & Dictionaries", difficulty: "Hard", approved: false, flagged: false },
  { id: "c5", type: "exam", title: "Midterm: Fundamentals & Functions", content: "Comprehensive exam covering Modules 1 and 2. 40% multiple choice, 30% short answer, 30% coding.", topic: "Functions", difficulty: "Hard", approved: true, flagged: false },
  { id: "c6", type: "exam", title: "Final: All Modules", content: "Cumulative exam covering all modules with emphasis on OOP and file handling.", topic: "OOP Basics", difficulty: "Hard", approved: false, flagged: false },
];

export const mockDashboard: DashboardMetrics = {
  activeStudents: 47,
  totalSessions: 312,
  topMisunderstood: ["Lists & Dictionaries", "Error Handling", "OOP Basics", "File Handling", "Functions"],
  masteryDistribution: { Beginner: 8, Progressing: 18, Proficient: 15, Expert: 6 },
  atRiskCount: 5,
};

export const defaultStudyPrompt = `You are a friendly and knowledgeable AI Teaching Assistant. Your role is to:
- Help students understand course concepts through clear explanations
- Break down complex topics into digestible parts
- Provide examples and analogies to aid understanding
- Encourage students to think critically and explore further
- Use the Socratic method when appropriate — guide rather than just give answers
- Format responses with markdown for readability (headers, bold, lists, code blocks)
Never give direct exam answers. Always explain the "why" behind concepts.`;

export const defaultExamPrompt = `You are an AI Teaching Assistant in Exam Prep mode. Help the student prepare for exams by:
- Asking practice questions related to their course material
- Providing explanations only after the student attempts an answer
- Giving constructive feedback on their responses
- Adjusting difficulty based on their performance
- Encouraging critical thinking rather than memorization
Keep responses focused and exam-relevant. Use markdown formatting.`;

export const defaultTASettings: TASettings = {
  hintLadder: true,
  knowledgeSources: "uploaded_and_web",
  plagiarismWarnings: true,
  examTimeLimit: 60,
  examDifficulty: "Mixed",
  examQuestionMix: "mixed",
  examPresentation: "all_at_once",
  studySystemPrompt: defaultStudyPrompt,
  examSystemPrompt: defaultExamPrompt,
  customStudyPrompt: "",
  customExamPrompt: "",
  quizNumQuestions: 5,
  quizQuestionMix: "mixed",
  quizDifficulty: "Medium",
  quizTimeLimit: 10,
  examApproved: false,
  quizApproved: false,
  examManualQuestions: false,
  examManualCount: null,
};

export const availableDepartments = [
  "Computer Science",
  "Electrical Engineering",
  "Mathematics",
  "Information Systems",
  "Data Science",
  "Software Engineering",
  "Mechanical Engineering",
  "Physics",
];

export const mockLearningChatMessages: ChatMessage[] = [
  {
    id: "m1", role: "assistant", timestamp: Date.now() - 300000,
    content: "👋 Hi! I'm your AI Teaching Assistant for **Intro to Python**. I'm here to help you understand concepts, work through practice problems, and prepare for exams.\n\nWhat topic would you like to explore today? You can pick from the topic selector, or just ask me anything!",
  },
  {
    id: "m2", role: "user", timestamp: Date.now() - 280000,
    content: "Can you explain how lists work in Python?",
  },
  {
    id: "m3", role: "assistant", timestamp: Date.now() - 270000,
    content: "Great question! **Lists** are one of Python's most versatile data structures.\n\n### How they work:\n1. **Creation**: Use square brackets: `my_list = [1, 2, 3]`\n2. **Indexing**: Access elements by position: `my_list[0]` returns `1`\n3. **Slicing**: Get a sub-list: `my_list[1:3]` returns `[2, 3]`\n4. **Methods**: `.append()`, `.remove()`, `.sort()`, `.pop()`\n\n### Key features:\n- Lists are **mutable** (can be changed after creation)\n- They can hold **mixed types**: `[1, 'hello', True]`\n- **Nested lists** are possible: `[[1,2], [3,4]]`\n\n**Quick check**: What would `len([1, [2, 3], 4])` return?",
  },
  {
    id: "m4", role: "user", timestamp: Date.now() - 250000,
    content: "It would return 3 because [2, 3] counts as one element?",
  },
  {
    id: "m5", role: "assistant", timestamp: Date.now() - 240000,
    content: "**Exactly right!** 🎉\n\n`len([1, [2, 3], 4])` returns **3** because:\n- Element 0: `1`\n- Element 1: `[2, 3]` (the nested list counts as ONE element)\n- Element 2: `4`\n\nThe `len()` function counts top-level elements only.\n\n**Follow-up challenge**: How would you access the number `3` from inside the nested list `[1, [2, 3], 4]`?\n\n*Hint: You'll need two sets of square brackets.*",
  },
];

export const mockExamChatMessages: ChatMessage[] = [
  {
    id: "e1", role: "assistant", timestamp: Date.now() - 100000,
    content: "🎯 **Exam Prep Mode Active**\n\nWelcome to exam simulation for **Intro to Python**.\n\n**Rules:**\n- Time limit: 60 minutes\n- Questions: 15 (mix of MCQ, short answer, coding)\n- Your answers will be evaluated at the end\n\nReady to begin? Click **Start Exam** or **Start Daily Quiz** below. Once started, the chatbot will be disabled — you'll answer questions directly.\n\nGood luck!",
  },
];

export const availableCourses = [
  { code: "PY101", name: "Intro to Python" },
];
