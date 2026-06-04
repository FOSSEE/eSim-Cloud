import store from '../../redux/store'

/**
 * Builds the context object to send to the AI backend.
 * Extracts the current schematic netlist and other relevant data from Redux.
 */
export const buildEditorContext = () => {
  const state = store.getState()
  
  const context = {
    page: 'simulator',
    netlist: state.netlistReducer?.netlist || '',
    // There is no lastSimulationError in Redux, but the error text is already
    // sent directly inside the message string via the CustomEvent pre-fill!
  }

  return context
}
