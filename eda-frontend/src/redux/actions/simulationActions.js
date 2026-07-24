import * as actions from './actions'

// Actions to update title for simulation result screen
export const setResultTitle = (title) => (dispatch) => {
  dispatch({
    type: actions.SET_RESULT_TITLE,
    payload: {
      title: title
    }
  })
}

// Action to update store with graphical result points
export const setResultGraph = (graph) => (dispatch) => {
  dispatch({
    type: actions.SET_RESULT_GRAPH,
    payload: {
      graph: graph
    }
  })
}

// Action to update store with simulation result text
export const setResultText = (text) => (dispatch) => {
  dispatch({
    type: actions.SET_RESULT_TEXT,
    payload: {
      text: text
    }
  })
}

// Action to update store with the last simulation error summary
export const setLastSimulationError = (errorSummary) => (dispatch) => {
  dispatch({
    type: actions.SET_LAST_SIMULATION_ERROR,
    payload: {
      lastSimulationError: errorSummary
    }
  })
}
