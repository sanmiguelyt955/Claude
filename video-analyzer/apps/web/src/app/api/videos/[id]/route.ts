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
  isAnotherWorkerAlive,
} from '@cva/memory-engine'
import { readJsonObject } from '../../../../lib/json-body'
import { deleteVideoUnlessBusy, removeVideoFiles } from '../../../../lib/video-delete'

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
    // The worker is its own process; without it every job stays queued
    // forever, so the page needs to know to say so. ("Another" worker is
    // any worker here: this server never runs one.)
    workerAlive: isAnotherWorkerAlive(),
  })
}

/** Edits the video's library data; today only `folder` (null or "" = sin carpeta). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  if (!getVideo(id)) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  const { folder } = await readJsonObject(request)
  if (folder !== null && typeof folder !== 'string') {
    return NextResponse.json({ error: 'Indica el nombre de la carpeta.' }, { status: 400 })
  }
  return NextResponse.json({ folder: setVideoFolder(id, folder) })
}

/**
 * Deletes the video from the library and frees its disk space: the stored
 * file, the frames, audio clips and thumbnail made for it, and the analysis
 * work folders. Refused while a job is still working on it.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const outcome = deleteVideoUnlessBusy(id)
  if (outcome === 'missing') return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  if (outcome === 'busy') {
    return NextResponse.json(
      { error: 'Este video se está procesando ahora. Espera a que termine para borrarlo.' },
      { status: 409 },
    )
  }
  const left = await removeVideoFiles(id)
  if (left.length) {
    console.warn(`[videos] ${id}: borrado, pero no se pudieron quitar: ${left.join(', ')}`)
    return NextResponse.json({
      ok: true,
      warning: 'El video se borró, pero algunos de sus archivos están en uso y no se pudieron quitar del disco.',
    })
  }
  return NextResponse.json({ ok: true })
}
