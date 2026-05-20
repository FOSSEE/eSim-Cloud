import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { TextField, InputAdornment, IconButton } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import SearchIcon from '@material-ui/icons/Search'
import ClearIcon from '@material-ui/icons/Clear'

const useStyles = makeStyles((theme) => ({
  searchWrapper: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1)
  },
  input: {
    fontSize: '0.875rem'
  }
}))

/**
 * Debounced search input for filtering the component sidebar.
 *
 * @param {function} onSearchChange - called with debounced query string
 * @param {string} placeholder - input placeholder text
 */
export default function ComponentSearchBar ({ onSearchChange, placeholder = 'Search components...' }) {
  const classes = useStyles()
  const [inputValue, setInputValue] = useState('')

  // Debounce: propagate the search string to the parent after 300 ms of
  // inactivity so we don't re-filter on every keystroke.
  useEffect(() => {
    const timerId = setTimeout(() => {
      onSearchChange(inputValue)
    }, 300)

    return () => clearTimeout(timerId)
  }, [inputValue, onSearchChange])

  /** Clear the input and immediately notify the parent. */
  const handleClear = useCallback(() => {
    setInputValue('')
    onSearchChange('')
  }, [onSearchChange])

  return (
    <div className={classes.searchWrapper}>
      <TextField
        id="component-search-bar"
        placeholder={placeholder}
        variant="outlined"
        size="small"
        fullWidth
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        InputProps={{
          className: classes.input,
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: inputValue ? (
            <InputAdornment position="end">
              <IconButton
                aria-label="clear search"
                onClick={handleClear}
                edge="end"
                size="small"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null
        }}
      />
    </div>
  )
}

ComponentSearchBar.propTypes = {
  /** Called with the debounced query string (or '' on clear). */
  onSearchChange: PropTypes.func.isRequired,
  /** Placeholder text for the input. */
  placeholder: PropTypes.string
}
