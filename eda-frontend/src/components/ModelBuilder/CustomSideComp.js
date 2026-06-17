import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { Tooltip } from '@material-ui/core'
import { AddComponent } from '../SchematicEditor/Helper/SideBar.js'

// Renders a draggable thumbnail for a saved custom component and wires it into
// the existing schematic placement flow, exactly like SideComp does for
// built-in parts. `component.svg_path` here is a blob URL (generated symbol).
export default function CustomSideComp ({ component }) {
  const imageRef = React.createRef()

  useEffect(() => {
    if (imageRef.current) {
      AddComponent(component, imageRef.current)
    }
    // eslint-disable-next-line
  }, [])

  return (
    <Tooltip title={`${component.name} (${component.model_type})`} arrow>
      <img
        ref={imageRef}
        className='compImage'
        src={component.svg_path}
        alt={component.name}
        style={{ width: 42, height: 42, cursor: 'grab', objectFit: 'contain' }}
        draggable={false}
      />
    </Tooltip>
  )
}

CustomSideComp.propTypes = {
  component: PropTypes.object.isRequired
}