import { useState } from 'react'
import type { Recipe } from './types'
import { createRecipeQuiz } from './quizQuestions'
import type { Question } from './quizQuestions'

type Props = {
  recipes: Recipe[]
  loading: boolean
  loadError: string
  onReload: () => void
  onOpenRecipe: (recipe: Recipe) => void
}

export function RecipeQuiz({ recipes, loading, loadError, onReload, onOpenRecipe }: Props) {
  const [category, setCategory] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [unavailable, setUnavailable] = useState(false)

  const categories = [...new Set(recipes.map(recipe => recipe.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
  const chosenCategory = category && categories.includes(category) ? category : null
  const question = questions[index]
  const selected = answers[index]
  const mistakes = questions.filter((item, position) => item.answer !== answers[position])
  const complete = questions.length > 0 && index === questions.length

  function start(newQuestions: Question[]) {
    setQuestions(newQuestions)
    setAnswers([])
    setIndex(0)
    setUnavailable(!newQuestions.length)
  }

  function reset() {
    setQuestions([])
    setAnswers([])
    setIndex(0)
    setUnavailable(false)
  }

  return <div className="quiz-page">
    <div className="page-heading"><div><h1>Тест</h1><p>Проверь знание барного меню.</p></div></div>
    {complete ? <section className="quiz-card">
      <h2>Результат</h2>
      <p role="status">Правильных ответов: <strong>{questions.length - mistakes.length} из {questions.length}</strong></p>
      {!!mistakes.length && <ul className="quiz-review">
        {mistakes.map(item => <li key={item.recipe.id}>
          <button className="quiz-link" onClick={() => onOpenRecipe(item.recipe)}>{item.recipe.name}</button>
          <span>{item.prompt} <strong>{item.answer}</strong></span>
        </li>)}
      </ul>}
      <div className="quiz-actions">
        {!!mistakes.length && <button className="primary-btn" onClick={() => start(mistakes)}>Повторить ошибки</button>}
        <button className="subtle-btn" onClick={reset}>Новый тест</button>
      </div>
    </section> : question ? <section className="quiz-card">
      <div className="quiz-progress">Вопрос {index + 1} из {questions.length}</div>
      <progress aria-label="Прогресс теста" value={index + Number(selected !== undefined)} max={questions.length}/>
      <h2>{question.recipe.name}</h2>
      <p>{question.prompt}</p>
      <div className="quiz-options">
        {question.options.map(option => {
          const correct = selected !== undefined && option === question.answer
          const wrong = option === selected && !correct
          return <button key={option} className={'quiz-option' + (correct ? ' quiz-correct' : wrong ? ' quiz-wrong' : '')}
            disabled={selected !== undefined} onClick={() => setAnswers(previous => previous.length === index ? [...previous, option] : previous)}>
            {correct && '✓ '}{wrong && '✕ '}{option}
          </button>
        })}
      </div>
      <div className="quiz-feedback" aria-live="polite">
        {selected !== undefined && <>
          <strong>{selected === question.answer ? 'Верно' : 'Правильный ответ: ' + question.answer}</strong>
          <button className="quiz-link" onClick={() => onOpenRecipe(question.recipe)}>Открыть техкарту</button>
        </>}
      </div>
      <div className="quiz-actions">
        <button className="primary-btn" disabled={selected === undefined} onClick={() => setIndex(index + 1)}>
          {index + 1 === questions.length ? 'Показать результат' : 'Следующий вопрос'}
        </button>
        <button className="subtle-btn" onClick={reset}>Завершить тест</button>
      </div>
    </section> : <section className="quiz-card">
      {loading ? <p role="status">Загружаем меню…</p> : loadError ? <>
        <p role="status">Не удалось загрузить меню.</p>
        <button className="subtle-btn" onClick={onReload}>Повторить загрузку</button>
      </> : recipes.length ? <>
        <label className="quiz-category">Категория
          <select value={chosenCategory ?? ''} onChange={event => { setCategory(event.target.value || null); setUnavailable(false) }}>
            <option value="">Все категории</option>
            {categories.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {unavailable && <p role="status">В техкартах пока недостаточно данных для вопросов.</p>}
        <div className="quiz-actions">
          <button className="primary-btn" onClick={() => start(createRecipeQuiz(recipes, chosenCategory))}>Начать тест</button>
        </div>
      </> : <>
        <p role="status">В меню пока нет техкарт.</p>
        <button className="subtle-btn" onClick={onReload}>Обновить меню</button>
      </>}
    </section>}
  </div>
}
