import type { StatefulSimulationSpec, SimulationEvent, SimulationStep } from '../interfaces'

export interface StatefulSimulationResult<TState, TEvent extends SimulationEvent> {
  finalState: TState
  steps: Array<SimulationStep<TState, TEvent>>
}

export function runStatefulSimulation<TState, TEvent extends SimulationEvent>(
  spec: StatefulSimulationSpec<TState, TEvent>
): StatefulSimulationResult<TState, TEvent> {
  const sortedEvents = [...spec.events].sort((a, b) => a.date.localeCompare(b.date))
  let state = spec.initialState

  const steps: Array<SimulationStep<TState, TEvent>> = []
  for (const event of sortedEvents) {
    state = spec.transition(state, event)
    steps.push({
      event,
      state
    })
  }

  return {
    finalState: state,
    steps
  }
}
