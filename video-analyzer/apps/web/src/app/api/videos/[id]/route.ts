import { NextResponse } from 'next/server'
import {
  getVideo,
  getVideoSummary,
  listScenes,
  listTranscriptChunks,
  listVideoElements,
  listAnalysisRunsForVideo,
  listSkillsForVideo,
  listSkillImprovementsForVideo,
  getActiveJobForVideo,
  setVideoFolder,
} from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })

  // Same shape as the list route's activeJob (route.ts) plus the numeric
  // fields the percentage-and-ETA progress bar needs — this detail page
  // never carried them before, so the bar here silently stayed
  // indeterminate even once a windowed analysis had real progress to show.
  const activeJob = getActiveJobForVideo(id)

  return NextResponse.json({
    video: {
      ...video,
      activeJob: activeJob
        ? {
            type: activeJob.type,
            status: activeJob.status,
            progressLabel: activeJob.progress_label,
            progressCurrent: activeJob.progress_current,
            progressTotal: activeJob.progress_total,
            startedAt: activeJob.started_at,
          }
        : null,
    },
    summary: getVideoSummary(id) ?? null,
    scenes: listScenes(id),
    transcript: listTranscriptChunks(id),
    elements: listVideoElements(id),
    analysisRuns: listAnalysisRunsForVideo(id),
    skills: listSkillsForVideo(id),
    skillImprovements: listSkillImprovementsForVideo(id),
  })
}

/** Edits the video's library data; today only `folder` (null or "" = sin carpeta). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  if (!getVideo(id)) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { folder?: unknown }
  if (body.folder !== null && typeof body.folder !== 'string') {
    return NextResponse.json({ error: 'Indica el nombre de la carpeta.' }, { status: 400 })
  }
  return NextResponse.json({ folder: setVideoFolder(id, body.folder) })
}
