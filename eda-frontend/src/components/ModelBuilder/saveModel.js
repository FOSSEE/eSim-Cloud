import api from '../../utils/Api'

// Turn generated SPICE text into a File, then POST to Parth's #539 endpoint.
// modelType: 'model' (from Model Builder) | 'subckt' (from Subcircuit Builder)
export async function saveCustomModel ({ name, modelType, spiceText }) {
  const trimmedName = (name || '').trim()
  if (!trimmedName) throw new Error('Please enter a name before saving.')
  if (!spiceText || !spiceText.trim()) throw new Error('Nothing to save yet.')

  // .model -> .lib file, .subckt -> .subckt file (extension is cosmetic; backend reads content)
  const ext = modelType === 'subckt' ? 'subckt' : 'lib'
  const file = new File([spiceText], `${trimmedName}.${ext}`, { type: 'text/plain' })

  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', trimmedName)
  formData.append('model_type', modelType)

  const token = localStorage.getItem('esim_token')
  const config = { headers: {} }
  if (token) config.headers.Authorization = `Token ${token}`

  const res = await api.post('simulation/models/upload', formData, config)
  return res.data   // { id, name, model_type, subckt_name, pin_count, ... }
}