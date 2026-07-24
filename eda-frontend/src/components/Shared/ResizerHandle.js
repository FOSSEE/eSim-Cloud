import React from 'react'

export default function ResizerHandle ({ onMouseDown, position }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [position]: 0,
        width: '6px',
        cursor: 'col-resize',
        zIndex: 1300,
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none'
      }}
      className="resizer-handle"
    >
      <div 
        className="resizer-line"
        style={{
          height: '100%',
          width: '2px',
          backgroundColor: 'transparent',
          transition: 'background-color 0.2s'
        }}
      />
    </div>
  )
}
