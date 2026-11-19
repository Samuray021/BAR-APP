import type { Recipe } from './types'

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

type QuestionDraft = Omit<Question, 'recipe' | 'options'> & { distractors: string[] }

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

export function createRecipeQuiz(recipes: Recipe[], category: string | null): Question[] {
  const ingredients = recipes.flatMap(recipe => (recipe.ingredients ?? []).map(item => item.name))
  const categories = recipes.map(recipe => recipe.category ?? '')
  const vessels = recipes.map(recipe => recipe.vessel ?? '')
  const groups = new Map<string, Question[]>()

  for (const recipe of shuffle(recipes)) {
    const recipeCategory = recipe.category || ''
    if (category !== null && category !== recipeCategory) continue

    const names = distinct((recipe.ingredients ?? []).map(item => item.name))
    const drafts: QuestionDraft[] = []
    const ingredient = shuffle(names)[0]
    if (ingredient) {
      drafts.push({
        prompt: 'Какой ингредиент входит в состав?',
        answer: ingredient,
        distractors: distinct(ingredients, names),
      })
    }
    if (recipe.vessel?.trim()) {
      drafts.push({
        prompt: 'В какой посуде подают эту позицию?',
        answer: recipe.vessel.trim(),
        distractors: distinct(vessels, [recipe.vessel]),
      })
    }
    if (drafts.every(item => !item.distractors.length) && recipeCategory.trim()) {
      drafts.push({
        prompt: 'К какой категории относится эта позиция?',
        answer: recipeCategory.trim(),
        distractors: distinct(categories, [recipeCategory]),
      })
    }

    const draft = shuffle(drafts.filter(item => item.distractors.length))[0]
    if (!draft) continue
    const { prompt, answer, distractors } = draft
    const question = { recipe, prompt, answer, options: shuffle([answer, ...shuffle(distractors).slice(0, 3)]) }
    const group = groups.get(recipeCategory) ?? []
    group.push(question)
    groups.set(recipeCategory, group)
  }

  const banks = [...groups.values()]
  const questions: Question[] = []
  const limit = Math.max(10, banks.length)
  for (let index = 0; questions.length < limit; index++) {
    const round = banks.flatMap(bank => bank[index] ? [bank[index]] : [])
    if (!round.length) break
    questions.push(...round.slice(0, limit - questions.length))
  }
  return questions
}
