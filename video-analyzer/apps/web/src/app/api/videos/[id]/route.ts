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

  return NextResponse.json({
    video,
    summary: getVideoSummary(id) ?? null,
    scenes: listScenes(id),
    transcript: listTranscriptChunks(id),
    elements: listVideoElements(id),
    analysisRuns: listAnalysisRunsForVideo(id),
    skills: listSkillsForVideo(id),
    skillImprovements: listSkillImprovementsForVideo(id),
  })
}
