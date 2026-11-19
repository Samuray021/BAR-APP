import type { Ingredient, Recipe } from './types'

export type Question = {
  recipe: Recipe
  prompt: string
  options: string[]
  answer: string
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

function distinct(values: string[], excluded: string[] = []) {
  const seen = new Set(excluded.map(normalize))
  return values.map(value => value.trim()).filter(value => {
    const key = normalize(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function makeQuestion(recipe: Recipe, prompt: string, answer: string, distractors: string[]): Question {
  return { recipe, prompt, answer, options: shuffle([answer, ...shuffle(distractors).slice(0, 3)]) }
}

const formatAmount = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 15, useGrouping: false })

function amountQuestion(recipe: Recipe, ingredient: Ingredient): Question | undefined {
  // Older tech cards can include the unit in the amount itself.
  const match = String(ingredient.amount ?? '').trim().match(/^(\d+(?:[.,]\d+)?|[.,]\d+)\s*([\p{L}][\p{L}.\s]*|%)?$/u)
  if (!match) return

  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2]?.trim() || ingredient.unit?.trim() || ''
  if (!Number.isFinite(amount) || amount <= 0) return

  const label = (value: number) => [formatAmount.format(value), unit].filter(Boolean).join(' ')
  const answer = label(amount)
  const step = amount >= 20 ? 5 : amount >= 5 ? 1 : 10 ** (Math.floor(Math.log10(amount)) - 1)
  const distractors = distinct(
    [-2, -1, 1, 2].map(offset => amount + offset * step).filter(value => value > 0 && Number.isFinite(value)).map(label),
    [answer],
  )
  if (distractors.length < 3) return

  return makeQuestion(recipe, `Сколько нужно ингредиента «${ingredient.name.trim()}»?`, answer, distractors)
}

export function createRecipeQuiz(recipes: Recipe[], category: string | null): Question[] {
  const ingredients = recipes.flatMap(recipe => (recipe.ingredients ?? []).map(item => item.name))
  const groups = new Map<string, { composition: Question[]; amount: Question[] }>()

  for (const recipe of shuffle(recipes)) {
    const recipeCategory = recipe.category || ''
    if (category !== null && category !== recipeCategory) continue

    const items = recipe.ingredients ?? []
    const names = distinct(items.map(item => item.name))
    const distractors = distinct(ingredients, names)
    const group = groups.get(recipeCategory) ?? { composition: [], amount: [] }
    if (names.length && distractors.length) {
      group.composition.push(makeQuestion(recipe, 'Какой ингредиент входит в состав?', shuffle(names)[0], distractors))
    }

    const counts = new Map<string, number>()
    for (const item of items) {
      const key = normalize(item.name)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const item of shuffle(items)) {
      const key = normalize(item.name)
      if (!key || counts.get(key) !== 1) continue
      const question = amountQuestion(recipe, item)
      if (!question) continue
      group.amount.push(question)
      break
    }

    if (group.composition.length || group.amount.length) groups.set(recipeCategory, group)
  }

  const banks = [...groups.values()].map(bank => ({ ...bank, amount: shuffle(bank.amount) }))
  const questions: Question[] = []
  const limit = Math.max(10, banks.length)
  const totals = { composition: 0, amount: 0 }
  while (questions.length < limit) {
    const before = questions.length
    for (const bank of banks) {
      const preferred = totals.composition <= totals.amount ? 'composition' : 'amount'
      const other = preferred === 'composition' ? 'amount' : 'composition'
      const kind = bank[preferred].length ? preferred : other
      const question = bank[kind].pop()
      if (!question) continue
      questions.push(question)
      totals[kind]++
      if (questions.length === limit) break
    }
    if (questions.length === before) break
  }
  return questions
}
