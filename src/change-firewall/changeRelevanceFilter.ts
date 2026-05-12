/**
 * changeRelevanceFilter.ts
 *
 * Filters candidate files by semantic relevance to the change description.
 * Prevents the Change Twin from dumping unrelated critical files when the
 * change is about infra, versioning, security, UI, or a specific domain.
 */

export type ChangeIntent =
  | 'infra-version-upgrade'   // java/node/python/docker version, runtime upgrade
  | 'dependency-upgrade'      // npm/maven/gradle dependency bump
  | 'ci-cd'                   // pipeline, workflow, github actions, jenkins
  | 'security'                // auth, JWT, CORS, roles, permissions
  | 'database'                // SQL, PL/SQL, migration, schema
  | 'api-endpoint'            // REST endpoint, controller, route
  | 'frontend-ui'             // React, Angular, component, UI, CSS
  | 'backend-logic'           // service, BO, business rule
  | 'testing'                 // test, spec, integration test
  | 'configuration'           // env, properties, YAML config
  | 'generic';                // fallback

// ─── Intent detection ────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ intent: ChangeIntent; patterns: RegExp[] }> = [
  {
    intent: 'infra-version-upgrade',
    patterns: [
      /\b(java|jdk|jre)\s*([\d]+|mais recente|latest|recente|update|upgrade|atualiz)/i,
      /\b(node|nodejs|python|ruby|go|kotlin|scala)\s*([\d]+|latest|upgrade|atualiz)/i,
      /\batualiz\w*\s+(java|jdk|node|python|docker|runtime|runtime)/i,
      /\bupgrade\s+(java|jdk|node|python|docker)/i,
      /\bversão\s+(do\s+)?(java|jdk|node|python|runtime)/i,
      /\bmigrar\s+(para\s+)?(java|jdk|node|python)\s*[\d]/i,
      /\bjava\s*[\d]+/i
    ]
  },
  {
    intent: 'dependency-upgrade',
    patterns: [
      /\b(atualiz|upgrade|bump)\w*\s+(depend[eê]ncia|library|lib|pacote|package)/i,
      /\b(npm|maven|gradle|pip|yarn)\s+(update|upgrade|atualiz)/i,
      /\bpom\.xml\b/i,
      /\bbuild\.gradle\b/i,
      /\bpackage\.json\b/i,
      /\bdependenci/i
    ]
  },
  {
    intent: 'ci-cd',
    patterns: [
      /\b(pipeline|workflow|ci|cd|deploy|jenkins|github.?action|gitlab.?ci|circle.?ci)\b/i,
      /\bdocker(file|.?compose|.?image)\b/i,
      /\bkubernetes|k8s|helm\b/i
    ]
  },
  {
    intent: 'security',
    patterns: [
      /\b(auth[a-z]*|login|senha|password|token|jwt|oauth|cors|role|permissão|permission|acesso|access)\b/i,
      /\bsegurança|security\b/i
    ]
  },
  {
    intent: 'database',
    patterns: [
      /\b(sql|plsql|migr[aã]|schema|tabela|table|banco|database|migration|flyway|liquibase)\b/i,
      /\b(select|insert|update|delete|create table|alter table)\b/i
    ]
  },
  {
    intent: 'api-endpoint',
    patterns: [
      /\b(endpoint|rota|route|controller|rest|api|get|post|put|patch|delete)\b/i,
      /\b(\/api\/|swagger|openapi)\b/i
    ]
  },
  {
    intent: 'frontend-ui',
    patterns: [
      /\b(frontend|tela|screen|componente|component|react|angular|vue|css|layout|ui|ux)\b/i,
      /\b(botão|button|modal|form|validação|validacao)\b/i
    ]
  },
  {
    intent: 'backend-logic',
    patterns: [
      /\b(regra de negócio|business rule|service|bo\b|logic|fluxo|validação|cálculo)\b/i
    ]
  },
  {
    intent: 'testing',
    patterns: [
      /\b(test[ae]|spec|junit|jest|integration test|unit test|mock|fixture)\b/i
    ]
  },
  {
    intent: 'configuration',
    patterns: [
      /\b(config|configuração|properties|\.yml|\.yaml|\.env|application\.properties)\b/i,
      /\b(ambiente|environment|profile|spring\.profiles)\b/i
    ]
  }
];

export function detectChangeIntent(description: string): ChangeIntent {
  const lower = description.toLowerCase();
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      return intent;
    }
  }
  return 'generic';
}

// ─── File relevance scoring ───────────────────────────────────────────────────

/** Returns 0..100 score of how relevant a file path is for a given intent + description. */
export function scoreFileRelevance(filePath: string, intent: ChangeIntent, keywords: string[]): number {
  const lowerPath = filePath.toLowerCase();
  let score = 0;

  // Direct keyword match in path
  for (const kw of keywords) {
    if (lowerPath.includes(kw.toLowerCase())) score += 20;
  }

  // Intent-based path patterns
  const INTENT_PATH_PATTERNS: Record<ChangeIntent, Array<{ pattern: RegExp; score: number }>> = {
    'infra-version-upgrade': [
      { pattern: /pom\.xml$/, score: 80 },
      { pattern: /build\.gradle(\.kts)?$/, score: 80 },
      { pattern: /dockerfile/i, score: 70 },
      { pattern: /\.github\/workflows\//i, score: 65 },
      { pattern: /application\.(properties|yml|yaml)$/i, score: 50 },
      { pattern: /\.mvn\//i, score: 40 },
      { pattern: /mvnw|gradlew/, score: 35 },
      { pattern: /java-version|toolchain|compileJava/i, score: 60 },
      { pattern: /\.java$/, score: 15 },
      { pattern: /\.sql$/, score: -30 },
      { pattern: /\.ts$|\.tsx$|\.js$/, score: -20 },
      { pattern: /src\/test\//, score: 5 }
    ],
    'dependency-upgrade': [
      { pattern: /pom\.xml$/, score: 80 },
      { pattern: /build\.gradle(\.kts)?$/, score: 80 },
      { pattern: /package\.json$/, score: 80 },
      { pattern: /requirements\.txt$/, score: 70 },
      { pattern: /dockerfile/i, score: 30 },
      { pattern: /\.sql$/, score: -30 },
      { pattern: /lock$/, score: -10 }
    ],
    'ci-cd': [
      { pattern: /dockerfile/i, score: 80 },
      { pattern: /\.github\/workflows\//i, score: 80 },
      { pattern: /jenkins/i, score: 70 },
      { pattern: /docker-compose/i, score: 65 },
      { pattern: /kubernetes|k8s|helm/i, score: 60 },
      { pattern: /\.sql$/, score: -30 }
    ],
    'security': [
      { pattern: /security|auth|login|jwt|cors/i, score: 70 },
      { pattern: /controller.*auth|auth.*controller/i, score: 60 },
      { pattern: /permission|role/i, score: 55 },
      { pattern: /\.sql$/, score: -10 }
    ],
    'database': [
      { pattern: /\.sql$/, score: 70 },
      { pattern: /migration|flyway|liquibase/i, score: 80 },
      { pattern: /repository|dao|mapper/i, score: 50 },
      { pattern: /\.java$/, score: 10 }
    ],
    'api-endpoint': [
      { pattern: /controller/i, score: 70 },
      { pattern: /route|router/i, score: 60 },
      { pattern: /service/i, score: 40 },
      { pattern: /\.sql$/, score: -10 }
    ],
    'frontend-ui': [
      { pattern: /\.tsx?$|\.jsx?$/, score: 50 },
      { pattern: /component|screen|page|view/i, score: 60 },
      { pattern: /\.css$|\.scss$|\.less$/, score: 50 },
      { pattern: /\.sql$/, score: -40 },
      { pattern: /\.java$/, score: -20 }
    ],
    'backend-logic': [
      { pattern: /service|bo\b|business/i, score: 60 },
      { pattern: /\.java$/, score: 20 },
      { pattern: /repository|dao/i, score: 30 }
    ],
    'testing': [
      { pattern: /test|spec/i, score: 70 },
      { pattern: /fixture|mock/i, score: 50 }
    ],
    'configuration': [
      { pattern: /application\.(properties|yml|yaml)$/i, score: 80 },
      { pattern: /\.env(\.|$)/i, score: 70 },
      { pattern: /config\./i, score: 60 },
      { pattern: /\.sql$/, score: -20 }
    ],
    'generic': []
  };

  for (const { pattern, score: s } of (INTENT_PATH_PATTERNS[intent] ?? [])) {
    if (pattern.test(filePath)) score += s;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Keyword extraction ───────────────────────────────────────────────────────

export function extractKeywords(description: string): string[] {
  // Remove common stop words, extract meaningful terms
  const stopWords = new Set([
    'para', 'para', 'com', 'sem', 'que', 'uma', 'um', 'os', 'as', 'de', 'do', 'da', 'no', 'na',
    'ao', 'pelo', 'pela', 'mais', 'menos', 'quando', 'onde', 'quero', 'preciso', 'fazer', 'the',
    'and', 'for', 'with', 'without', 'this', 'that', 'from', 'into', 'over', 'after', 'want',
    'need', 'to', 'of', 'in', 'on', 'at', 'by', 'an', 'a', 'is', 'are', 'be', 'have', 'has'
  ]);

  return description
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúâêîôûãõçüà\s/-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word))
    .slice(0, 20);
}

// ─── Main filter function ─────────────────────────────────────────────────────

export interface FilteredFiles {
  editFiles: string[];
  reviewFiles: string[];
  intent: ChangeIntent;
  keywords: string[];
}

/**
 * Given a raw list of candidate files and the change description,
 * returns only the files relevant to this specific change, sorted by score.
 */
export function filterFilesByRelevance(
  allFiles: string[],
  description: string,
  maxEdit: number = 20,
  maxReview: number = 30
): FilteredFiles {
  const intent = detectChangeIntent(description);
  const keywords = extractKeywords(description);

  if (intent === 'generic') {
    // For generic changes, do a simple keyword match and limit output
    const filtered = allFiles.filter((f) =>
      keywords.some((kw) => f.toLowerCase().includes(kw))
    );
    const result = filtered.length > 0 ? filtered : allFiles.slice(0, maxEdit);
    return {
      editFiles: result.slice(0, maxEdit),
      reviewFiles: result.slice(maxEdit, maxEdit + maxReview),
      intent,
      keywords
    };
  }

  // Score and sort all files
  const scored = allFiles.map((file) => ({
    file,
    score: scoreFileRelevance(file, intent, keywords)
  }));

  // Filter: only include files with score >= threshold
  const EDIT_THRESHOLD = 10;
  const REVIEW_THRESHOLD = 5;

  const relevant = scored
    .filter((item) => item.score >= REVIEW_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const editCandidates = relevant.filter((item) => item.score >= EDIT_THRESHOLD);
  const reviewCandidates = relevant.filter((item) => item.score < EDIT_THRESHOLD);

  // If nothing relevant found, return a small fallback with explanation
  if (editCandidates.length === 0) {
    const topAny = scored.sort((a, b) => b.score - a.score).slice(0, 5);
    return {
      editFiles: topAny.map((item) => item.file),
      reviewFiles: [],
      intent,
      keywords
    };
  }

  return {
    editFiles: editCandidates.slice(0, maxEdit).map((item) => item.file),
    reviewFiles: reviewCandidates.slice(0, maxReview).map((item) => item.file),
    intent,
    keywords
  };
}
