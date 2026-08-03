import * as actions from './actions'

// Action to update netlist with component nodes and parameters.
// autoRun marks a one-shot "Send to Simulator" hand-off; the simulation
// panel consumes it (and only it) to auto-execute — a plain SET_NETLIST
// must never auto-run, or stale netlists replay on other circuits.
export const setNetlist = (netlist, autoRun = false) => (dispatch) => {
  dispatch({
    type: actions.SET_NETLIST,
    payload: {
      netlist: netlist,
      autoRun: autoRun
    }
  })
}

// Action to update netlist title
export const setTitle = (title) => (dispatch) => {
  dispatch({
    type: actions.SET_TITLE,
    payload: {
      title: title
    }
  })
}

// Action to update netlist model section
export const setModel = (model) => (dispatch) => {
  dispatch({
    type: actions.SET_MODEL,
    payload: {
      model: model
    }
  })
}

// Action to update netlist contorl line section
export const setControlLine = (controlLine) => (dispatch) => {
  dispatch({
    type: actions.SET_CONTROL_LINE,
    payload: {
      controlLine: controlLine
    }
  })
}

// Action to update netlist control block section
export const setControlBlock = (controlBlock) => (dispatch) => {
  dispatch({
    type: actions.SET_CONTROL_BLOCK,
    payload: {
      controlBlock: controlBlock
    }
  })
}
