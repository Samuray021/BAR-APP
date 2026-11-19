import type { Ingredient, Recipe } from './types'

export type Question = {
  recipe: Recipe
  options: string[]
  answers: string[]
  part: number
  parts: number
}

function shuffle<T>(values: readonly T[]) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
const formatAmount = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 15, useGrouping: false })
const optionCount = 10
const maxAnswers = optionCount - 1

function ingredientOption(item: Ingredient) {
  const name = item.name?.trim() ?? ''
  const raw = String(item.amount ?? '').trim()
  const match = raw.match(/^(\d+(?:[.,]\d+)?|[.,]\d+)\s*([\p{L}][\p{L}.\s]*|%)?$/u)
  const amount = match ? Number(match[1].replace(',', '.')) : NaN
  const unit = match?.[2]?.trim() || item.unit?.trim() || ''
  const numeric = Number.isFinite(amount)
  const measure = numeric ? [formatAmount.format(amount), unit].filter(Boolean).join(' ') : raw
  return {
    nameKey: normalize(name),
    label: name && measure ? `${name} — ${measure}` : '',
    alternative: (offset: number) => {
      const next = amount + offset
      if (!numeric || next <= 0 || !Number.isFinite(next)) return ''
      return `${name} — ${[formatAmount.format(next), unit].filter(Boolean).join(' ')}`
    },
    step: amount >= 20 ? 5 : amount >= 5 ? 1 : 10 ** (Math.floor(Math.log10(amount || 1)) - 1),
  }
}

export function isCorrectAnswer(question: Question, selected: readonly string[]) {
  return selected.length === question.answers.length && question.answers.every(answer => selected.includes(answer))
}

export function createRecipeQuiz(recipes: Recipe[], category: string | null): Question[] {
  const entries = shuffle(recipes).map(recipe => ({
    recipe,
    items: (recipe.ingredients ?? []).map(ingredientOption).filter(item => item.nameKey),
  }))
  const pool = shuffle(entries.flatMap(entry => entry.items).filter(item => item.label))
  const groups = new Map<string, Question[][]>()

  for (const { recipe, items } of entries) {
    const recipeCategory = recipe.category || ''
    if (category !== null && category !== recipeCategory) continue
    if (!items.length || items.some(item => !item.label)) continue

    const correct = new Map(items.map(item => [normalize(item.label), item]))
    const names = new Set(items.map(item => item.nameKey))
    const unrelated = pool.filter(item => !names.has(item.nameKey))
    const shuffledItems = shuffle([...correct.values()])
    const parts = Math.ceil(shuffledItems.length / maxAnswers)
    const partSize = Math.ceil(shuffledItems.length / parts)
    const recipeQuestions: Question[] = []

    for (let part = 0; part < parts; part++) {
      const partItems = shuffledItems.slice(part * partSize, (part + 1) * partSize)
      const answers = partItems.map(item => item.label)
      const remaining = optionCount - answers.length
      const distractors = new Map<string, string>()
      function add(label: string) {
        const key = normalize(label)
        if (key && !correct.has(key) && !distractors.has(key) && distractors.size < remaining) distractors.set(key, label)
      }

      const nearby = shuffle(partItems.flatMap(item => [-2, -1, 1, 2].map(offset => item.alternative(offset * item.step))).filter(Boolean))
      nearby.slice(0, Math.ceil(remaining / 2)).forEach(add)
      for (const item of unrelated) {
        if (distractors.size === remaining) break
        add(item.label)
      }
      for (let offset = 1; offset <= optionCount * 2 && distractors.size < remaining; offset++) {
        for (const item of partItems) add(item.alternative(offset * item.step))
      }

      if (distractors.size === remaining) {
        recipeQuestions.push({ recipe, answers, part: part + 1, parts, options: shuffle([...answers, ...distractors.values()]) })
      }
    }

    if (recipeQuestions.length !== parts) continue
    const bank = groups.get(recipeCategory) ?? []
    bank.push(recipeQuestions)
    groups.set(recipeCategory, bank)
  }

  const banks = [...groups.values()]
  const questions: Question[] = []
  const limit = Math.max(10, banks.length)
  let recipesChosen = 0
  while (recipesChosen < limit) {
    const before = recipesChosen
    for (const bank of banks) {
      const next = bank.pop()
      if (!next) continue
      questions.push(...next)
      if (++recipesChosen === limit) break
    }
    if (recipesChosen === before) break
  }
  return questions
}
