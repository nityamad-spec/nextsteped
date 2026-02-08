import { ChatMessage, ConceptTopic, ContentItem, Course, DashboardMetrics, QuizQuestion, SyllabusRecommendation, TASettings } from "@/types";

export const mockCourse: Course = {
  id: "cs301",
  name: "Operating Systems",
  term: "First Semester",
  sections: ["Section A", "Section B"],
  objectives: [
    "Understand process management and scheduling algorithms",
    "Master memory management concepts including virtual memory",
    "Learn file system design and implementation",
    "Understand concurrency, synchronization, and deadlocks",
  ],
  enrollmentCode: "NEXTOS301",
  syllabusUploaded: true,
  materialsUploaded: true,
  published: true,
  startDate: "2025-08-25",
  endDate: "2025-12-15",
};

export const mockTopics: ConceptTopic[] = [
  { id: "t1", name: "Process Management", module: "Module 1: Fundamentals", prerequisites: [], confidence: "High", mastery: 85 },
  { id: "t2", name: "CPU Scheduling", module: "Module 1: Fundamentals", prerequisites: ["t1"], confidence: "High", mastery: 78 },
  { id: "t3", name: "Memory Management", module: "Module 2: Memory", prerequisites: ["t1"], confidence: "Medium", mastery: 62 },
  { id: "t4", name: "Virtual Memory", module: "Module 2: Memory", prerequisites: ["t3"], confidence: "Low", mastery: 45 },
  { id: "t5", name: "File Systems", module: "Module 3: Storage", prerequisites: ["t3"], confidence: "Medium", mastery: 58 },
  { id: "t6", name: "Synchronization", module: "Module 4: Concurrency", prerequisites: ["t1", "t2"], confidence: "Low", mastery: 38 },
  { id: "t7", name: "Deadlocks", module: "Module 4: Concurrency", prerequisites: ["t6"], confidence: "Low", mastery: 30 },
  { id: "t8", name: "I/O Systems", module: "Module 3: Storage", prerequisites: ["t5"], confidence: "Medium", mastery: 55 },
];

export const mockQuizQuestions: QuizQuestion[] = [
  {
    id: "q1", question: "What is the primary purpose of an operating system?", topic: "Process Management",
    options: ["To manage hardware resources and provide services to applications", "To compile source code into machine code", "To design user interfaces", "To store data permanently"],
    correctIndex: 0, difficulty: "Easy", explanation: "An OS manages hardware resources (CPU, memory, I/O) and provides services for application programs.",
  },
  {
    id: "q2", question: "Which scheduling algorithm may cause starvation?", topic: "CPU Scheduling",
    options: ["Round Robin", "Shortest Job First (SJF)", "First Come First Served (FCFS)", "Multilevel Queue"],
    correctIndex: 1, difficulty: "Medium", explanation: "SJF can cause starvation for long processes if shorter ones keep arriving.",
  },
  {
    id: "q3", question: "What is thrashing in the context of virtual memory?", topic: "Virtual Memory",
    options: ["Excessive paging causing severe performance degradation", "A type of memory leak", "Fragmentation of physical memory", "Buffer overflow attack"],
    correctIndex: 0, difficulty: "Hard", explanation: "Thrashing occurs when the system spends more time paging than executing, severely degrading performance.",
  },
  {
    id: "q4", question: "Which synchronization mechanism uses a binary variable?", topic: "Synchronization",
    options: ["Semaphore", "Mutex", "Monitor", "Barrier"],
    correctIndex: 1, difficulty: "Medium", explanation: "A mutex (mutual exclusion) uses a binary lock variable — locked or unlocked.",
  },
  {
    id: "q5", question: "What are the four necessary conditions for deadlock?", topic: "Deadlocks",
    options: [
      "Mutual exclusion, hold & wait, no preemption, circular wait",
      "Starvation, livelock, priority inversion, race condition",
      "Atomicity, consistency, isolation, durability",
      "Synchronization, scheduling, allocation, deallocation",
    ],
    correctIndex: 0, difficulty: "Hard", explanation: "The four Coffman conditions are mutual exclusion, hold and wait, no preemption, and circular wait.",
  },
  {
    id: "q6", question: "What is the difference between a process and a thread?", topic: "Process Management",
    options: [
      "A thread is a lightweight unit of execution within a process sharing its address space",
      "A process runs in user mode while threads run in kernel mode",
      "Threads cannot share memory",
      "Processes are faster than threads",
    ],
    correctIndex: 0, difficulty: "Easy", explanation: "Threads are lightweight execution units within a process, sharing the same address space and resources.",
  },
  {
    id: "q7", question: "What page replacement algorithm is optimal but impractical?", topic: "Virtual Memory",
    options: ["LRU", "FIFO", "OPT (Bélády's)", "Clock"],
    correctIndex: 2, difficulty: "Medium", explanation: "OPT replaces the page that won't be used for the longest time — optimal but requires future knowledge.",
  },
];

export const mockSyllabusRecommendations: SyllabusRecommendation[] = [
  {
    id: "r1", category: "Industry Alignment",
    original: "Introduction to process scheduling",
    suggestion: "Add container orchestration concepts (K8s scheduling) as real-world application of OS scheduling",
    reason: "Bridges academic concepts with industry practices in cloud computing", accepted: null,
  },
  {
    id: "r2", category: "Experiential Learning",
    original: "Memory management lecture",
    suggestion: "Add hands-on lab: implement a simple memory allocator in C",
    reason: "Active coding reinforces theoretical concepts and builds practical skills", accepted: null,
  },
  {
    id: "r3", category: "Assessment Improvement",
    original: "Written exam on file systems",
    suggestion: "Replace with project-based assessment: design a mini file system with journaling",
    reason: "Project work demonstrates deeper understanding than memorization", accepted: null,
  },
  {
    id: "r4", category: "Modern Topics",
    original: "Traditional I/O systems coverage",
    suggestion: "Include NVMe, SSDs, and modern storage architectures alongside traditional HDD concepts",
    reason: "Students need exposure to current storage technologies used in industry", accepted: null,
  },
];

export const mockContentItems: ContentItem[] = [
  { id: "c1", type: "concept", title: "Process Lifecycle", content: "A process goes through several states: New → Ready → Running → Waiting → Terminated. The OS scheduler manages transitions between these states.", topic: "Process Management", difficulty: "Easy", approved: true, flagged: false },
  { id: "c2", type: "concept", title: "Round Robin Scheduling", content: "Round Robin assigns a fixed time quantum to each process. When the quantum expires, the process is preempted and moved to the back of the ready queue.", topic: "CPU Scheduling", difficulty: "Medium", approved: true, flagged: false },
  { id: "c3", type: "practice", title: "Implement FCFS Scheduler", content: "Write a program that simulates First Come First Served scheduling. Given arrival times and burst times, calculate waiting time and turnaround time for each process.", topic: "CPU Scheduling", difficulty: "Medium", approved: false, flagged: false },
  { id: "c4", type: "practice", title: "Page Replacement Simulation", content: "Implement LRU and FIFO page replacement algorithms. Compare their performance given a reference string and frame count.", topic: "Virtual Memory", difficulty: "Hard", approved: false, flagged: false },
  { id: "c5", type: "exam", title: "Midterm: Scheduling & Memory", content: "Comprehensive exam covering Modules 1 and 2. 40% multiple choice, 30% short answer, 30% problem solving.", topic: "CPU Scheduling", difficulty: "Hard", approved: true, flagged: false },
  { id: "c6", type: "exam", title: "Final: All Modules", content: "Cumulative exam covering all four modules with emphasis on concurrency and synchronization.", topic: "Deadlocks", difficulty: "Hard", approved: false, flagged: false },
];

export const mockDashboard: DashboardMetrics = {
  activeStudents: 47,
  totalSessions: 312,
  topMisunderstood: ["Virtual Memory", "Deadlocks", "Synchronization", "Page Replacement", "Semaphores"],
  masteryDistribution: { Beginner: 8, Intermediate: 18, Advanced: 15, Expert: 6 },
  atRiskCount: 5,
};

export const defaultTASettings: TASettings = {
  hintLadder: true,
  knowledgeSources: "uploaded_and_web",
  citationRequired: true,
  plagiarismWarnings: true,
  examTimeLimit: 60,
  examDifficulty: "Mixed",
  examQuestionMix: "40% MCQ, 30% Short Answer, 30% Problem Solving",
};

export const mockLearningChatMessages: ChatMessage[] = [
  {
    id: "m1", role: "assistant", timestamp: Date.now() - 300000,
    content: "👋 Hi! I'm your AI Teaching Assistant for **Operating Systems**. I'm here to help you understand concepts, work through practice problems, and prepare for exams.\n\nWhat topic would you like to explore today? You can pick from the topic selector, or just ask me anything!",
  },
  {
    id: "m2", role: "user", timestamp: Date.now() - 280000,
    content: "Can you explain how virtual memory works?",
  },
  {
    id: "m3", role: "assistant", timestamp: Date.now() - 270000,
    content: "Great question! **Virtual Memory** is a memory management technique that creates an illusion of a very large main memory.\n\n### How it works:\n1. **Address Translation**: Each process gets its own virtual address space. The MMU (Memory Management Unit) translates virtual addresses to physical addresses.\n2. **Paging**: Memory is divided into fixed-size blocks called **pages** (virtual) and **frames** (physical).\n3. **Page Table**: Maps virtual pages to physical frames.\n4. **Demand Paging**: Pages are loaded into memory only when needed (on demand).\n\n### Why it matters:\n- Processes can use more memory than physically available\n- Provides memory isolation between processes\n- Enables efficient memory sharing\n\n**Quick check**: If a system has 4KB pages and a 32-bit virtual address space, how many entries does the page table need?",
  },
  {
    id: "m4", role: "user", timestamp: Date.now() - 250000,
    content: "Would it be 2^32 / 2^12 = 2^20 = about 1 million entries?",
  },
  {
    id: "m5", role: "assistant", timestamp: Date.now() - 240000,
    content: "**Exactly right!** 🎉\n\n2^32 / 2^12 = 2^20 = **1,048,576 entries**\n\nYou divided the total address space (2^32 bytes) by the page size (4KB = 2^12 bytes) to get the number of pages.\n\nThis is actually one reason why **multi-level page tables** were invented — a single flat table with 1M entries would waste a lot of memory.\n\n**Follow-up challenge**: Can you think of why a two-level page table might save memory compared to a single-level one?\n\n*Hint: Think about which parts of the address space most processes actually use.*",
  },
];

export const mockExamChatMessages: ChatMessage[] = [
  {
    id: "e1", role: "assistant", timestamp: Date.now() - 100000,
    content: "🎯 **Exam Prep Mode Active**\n\nWelcome to exam simulation for **Operating Systems — Midterm Exam**.\n\n**Rules:**\n- Time limit: 60 minutes\n- Questions: 15 (mix of MCQ, short answer, problem solving)\n- Limited hints available (per professor settings)\n- Your answers will be evaluated at the end\n\nReady to begin? Click **Start Simulation** or ask me to configure a custom practice session.",
  },
];

export const availableCourses = [
  { code: "CS301", name: "Operating Systems" },
  { code: "CS201", name: "Data Structures & Algorithms" },
  { code: "CS401", name: "Machine Learning" },
  { code: "CS350", name: "Computer Networks" },
];