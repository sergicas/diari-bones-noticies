const CRON_WARNING_AGE_MS = 14 * 60 * 60 * 1000
const CRON_CRITICAL_AGE_MS = 26 * 60 * 60 * 1000
const QUEUE_WARNING_BACKLOG = 10
const QUEUE_CRITICAL_BACKLOG = 100
const QUEUE_WARNING_AGE_MS = 15 * 60 * 1000
const QUEUE_CRITICAL_AGE_MS = 60 * 60 * 1000

const severityRank = {
  info: 0,
  warning: 1,
  critical: 2,
}

function timestamp(value) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function addIssue(issues, severity, code, title, detail) {
  issues.push({ severity, code, title, detail })
}

function evaluateQueue(issues, name, queue, now) {
  if (!queue?.available) {
    addIssue(
      issues,
      'warning',
      `queue-${name}-unavailable`,
      `Mètriques de la cua ${name} no disponibles`,
      'El Worker continua operatiu, però el tauler no pot confirmar-ne la cua.',
    )
    return
  }

  const backlog = Number(queue.backlogCount || 0)
  if (backlog >= QUEUE_CRITICAL_BACKLOG) {
    addIssue(
      issues,
      'critical',
      `queue-${name}-backlog-critical`,
      `Cua ${name} amb ${backlog} missatges pendents`,
      'El volum supera el llindar crític i pot indicar un consumidor aturat.',
    )
  } else if (backlog >= QUEUE_WARNING_BACKLOG) {
    addIssue(
      issues,
      'warning',
      `queue-${name}-backlog-warning`,
      `Cua ${name} amb ${backlog} missatges pendents`,
      'El backlog és superior al nivell habitual.',
    )
  }

  const oldestAt = timestamp(queue.oldestMessageTimestamp)
  const oldestAge = oldestAt ? now - oldestAt : 0
  if (oldestAge >= QUEUE_CRITICAL_AGE_MS) {
    addIssue(
      issues,
      'critical',
      `queue-${name}-age-critical`,
      `La cua ${name} té missatges de més d’una hora`,
      'Cal revisar el consumidor i la DLQ abans de reprocessar res.',
    )
  } else if (oldestAge >= QUEUE_WARNING_AGE_MS) {
    addIssue(
      issues,
      'warning',
      `queue-${name}-age-warning`,
      `La cua ${name} té missatges de més de 15 minuts`,
      'La ingesta normal de staging pot durar uns minuts; vigila que progressi.',
    )
  }
}

export function buildOperationalHealth({
  now = Date.now(),
  cronTiming,
  circuitBreakers = [],
  pipeline,
} = {}) {
  const issues = []
  const cronUpdatedAt = timestamp(cronTiming?.updatedAt)

  if (!cronUpdatedAt) {
    addIssue(
      issues,
      'warning',
      'cron-no-data',
      'Encara no hi ha telemetria del cron',
      'És normal en un entorn nou; ha de desaparèixer després de la primera edició.',
    )
  } else {
    const cronAge = now - cronUpdatedAt
    if (cronAge >= CRON_CRITICAL_AGE_MS) {
      addIssue(
        issues,
        'critical',
        'cron-stale-critical',
        'El radar fa més de 26 hores que no publica telemetria',
        'S’han perdut com a mínim dues finestres editorials programades.',
      )
    } else if (cronAge >= CRON_WARNING_AGE_MS) {
      addIssue(
        issues,
        'warning',
        'cron-stale-warning',
        'El darrer cron supera les 14 hores',
        'Comprova el job d’ingesta abans de la pròxima finestra editorial.',
      )
    }
  }

  if (circuitBreakers.length > 0) {
    addIssue(
      issues,
      'warning',
      'feeds-paused',
      `${circuitBreakers.length} font(s) en circuit breaker`,
      'Les fonts afectades es reintentaran automàticament quan acabi la pausa.',
    )
  }

  const database = pipeline?.database
  if (!database?.available) {
    addIssue(
      issues,
      'critical',
      'd1-unavailable',
      'D1 no està disponible al diagnòstic',
      'Les lectures encara tenen fallback a KV, però no hi ha historial durable.',
    )
  } else {
    if (Number(database.jobs?.failed || 0) > 0) {
      addIssue(
        issues,
        'warning',
        'pipeline-failed-jobs',
        `${database.jobs.failed} job(s) marcats com a fallits`,
        'Revisa el detall abans de reenviar-los amb una nova clau d’idempotència.',
      )
    }
    if (Number(database.jobs?.staleProcessing || 0) > 0) {
      addIssue(
        issues,
        'critical',
        'pipeline-stale-jobs',
        `${database.jobs.staleProcessing} job(s) encallats en processament`,
        'Porten més de 15 minuts sense actualitzar-se.',
      )
    }
  }

  evaluateQueue(issues, 'ingesta', pipeline?.queues?.ingest, now)
  evaluateQueue(issues, 'distribució', pipeline?.queues?.distribution, now)

  const highestSeverity = issues.reduce(
    (current, issue) =>
      severityRank[issue.severity] > severityRank[current]
        ? issue.severity
        : current,
    'info',
  )

  return {
    status:
      highestSeverity === 'critical'
        ? 'critical'
        : highestSeverity === 'warning'
          ? 'warning'
          : 'healthy',
    checkedAt: new Date(now).toISOString(),
    issues,
  }
}

