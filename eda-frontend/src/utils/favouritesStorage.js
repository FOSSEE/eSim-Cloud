/**
 * @fileoverview favouritesStorage.js
 *
 * Pure localStorage helpers for the Favourites feature.
 * No backend API calls. No auth checks.
 * Works for every user (logged-in or guest) without any account.
 *
 * Storage key: 'esim_favourite_components'
 * Storage value: JSON array of full component objects.
 */

const STORAGE_KEY = 'esim_favourite_components'

/**
 * Reads the favourites array from localStorage.
 * @returns {Array} Stored component objects, or [] on error / empty.
 */
export function getFavourites () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('[favouritesStorage] getFavourites error:', err)
    return []
  }
}

/**
 * Adds a component to the favourites array if not already present.
 * Uses component.id as the unique key to avoid duplicates.
 * @param {object} component - Full component object from the sidebar.
 * @returns {Array} Updated favourites array.
 */
export function addFavourite (component) {
  try {
    const current = getFavourites()
    const alreadyExists = current.some((fav) => fav.id === component.id)
    if (alreadyExists) return current
    const updated = [...current, component]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return updated
  } catch (err) {
    console.error('[favouritesStorage] addFavourite error:', err)
    return getFavourites()
  }
}

/**
 * Removes a component from the favourites array by id.
 * @param {number|string} componentId - The id of the component to remove.
 * @returns {Array} Updated favourites array.
 */
export function removeFavourite (componentId) {
  try {
    const current = getFavourites()
    const updated = current.filter((fav) => fav.id !== componentId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return updated
  } catch (err) {
    console.error('[favouritesStorage] removeFavourite error:', err)
    return getFavourites()
  }
}

/**
 * Checks if a component is already in the favourites array.
 * @param {number|string} componentId - The id to look up.
 * @returns {boolean}
 */
export function isFavourite (componentId) {
  try {
    const current = getFavourites()
    return current.some((fav) => fav.id === componentId)
  } catch (err) {
    console.error('[favouritesStorage] isFavourite error:', err)
    return false
  }
}
