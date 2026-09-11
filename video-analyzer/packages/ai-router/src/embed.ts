import { getGeminiClient } from './client.js'

const BATCH_SIZE = 20

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

export type EmbeddedText = {
  text: string
  embedding: number[]
}

/**
 * Embeds a batch of texts, chunked to stay well under the API's per-request
 * limits. Uses RETRIEVAL_DOCUMENT for indexing and RETRIEVAL_QUERY for a
 * search query — Gemini's embeddings are asymmetric, so using the same task
 * type for both sides measurably hurts retrieval quality.
 */
export async function embedTexts(
  texts: string[],
  model: string,
  outputDimensionality: number,
  taskType: EmbedTaskType,
): Promise<EmbeddedText[]> {
  const ai = getGeminiClient()
  const results: EmbeddedText[] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await ai.models.embedContent({
      model,
      contents: batch,
      config: { taskType, outputDimensionality },
    })
    const embeddings = response.embeddings ?? []
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Gemini devolvio ${embeddings.length} embeddings para un lote de ${batch.length} textos.`,
      )
    }
    for (let j = 0; j < batch.length; j++) {
      const values = embeddings[j]?.values
      if (!values) throw new Error('Gemini devolvio un embedding vacio.')
      results.push({ text: batch[j]!, embedding: values })
    }
  }

  return results
}
