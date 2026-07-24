import * as actions from '../actions/actions'

const initialState = {
  title: '',
  isGraph: 'false',
  text: [],
  graph: {},
  isSimRes: false,
  lastSimulationError: null
}

export default function (state = initialState, action) {
  switch (action.type) {
    case actions.SET_RESULT_TITLE: {
      return {
        ...state,
        title: action.payload.title
      }
    }
    case actions.SET_RESULT_GRAPH: {
      return {
        ...state,
        isSimRes: true,
        isGraph: 'true',
        graph: action.payload.graph
      }
    }

    case actions.SET_RESULT_TEXT: {
      return {
        ...state,
        isSimRes: true,
        isGraph: 'false',
        text: action.payload.text
      }
    }

    case actions.SET_LAST_SIMULATION_ERROR: {
      return {
        ...state,
        lastSimulationError: action.payload.lastSimulationError
      }
    }

    default:
      return state
  }
}
