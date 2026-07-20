/* eslint-disable camelcase */
import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  Slide,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextareaAutosize,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Container,
  Grid,
  Paper,
  Divider,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  ListSubheader,
  Avatar,
  ListItemAvatar,
  Tooltip,
  Snackbar,
  Collapse,
  Hidden,
  Input,
  Chip
} from '@material-ui/core'

import { makeStyles } from '@material-ui/core/styles'
import CloseIcon from '@material-ui/icons/Close'
import KeyboardIcon from '@material-ui/icons/Keyboard'
import TableChartOutlinedIcon from '@material-ui/icons/TableChartOutlined'
import TuneIcon from '@material-ui/icons/Tune'
import { useSelector, useDispatch } from 'react-redux'
import { setTitle, setSchTitle, fetchSchematics, fetchSchematic, fetchGallerySchematic, fetchAllLibraries, fetchLibrary, removeLibrary, uploadLibrary, resetUploadSuccess, deleteLibrary, fetchComponents, fetchGallery, setSchXmlData, saveSchematic } from '../../redux/actions/index'
import { blue } from '@material-ui/core/colors'
import { Alert } from '@material-ui/lab'
import Tabs from '@material-ui/core/Tabs'
import Tab from '@material-ui/core/Tab'
import Box from '@material-ui/core/Box'
import ExpandMore from '@material-ui/icons/ExpandMore'
import ExpandLess from '@material-ui/icons/ExpandLess'
import { fetchRole } from '../../redux/actions/authActions'
import Canvg from 'canvg'
import { Save } from './Helper/ToolbarTools'

const Transition = React.forwardRef(function Transition (props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})

const FileSaver = require('file-saver')

// Dialog box to display generated netlist
export function NetlistModal ({ open, close, netlist }) {
  const netfile = useSelector(state => state.netlistReducer)
  const createNetlistFile = () => {
    const titleA = netfile.title.split(' ')[1]
    const blob = new Blob([netlist], { type: 'text/plain;charset=utf-8' })
    FileSaver.saveAs(blob, `${titleA}_eSim_on_cloud.cir`)
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      TransitionComponent={Transition}
      keepMounted
      aria-labelledby="generate-netlist"
      aria-describedby="generate-netlist-description"
    >
      <DialogTitle id="generate-netlist-title">{'Netlist Generator'}</DialogTitle>
      <DialogContent dividers>
        <DialogContentText id="generate-netlist-description">
          Current Netlist for given schematic...<br /><br />
          <TextareaAutosize aria-label="empty textarea" rowsMin={20} rowsMax={50} style={{ minWidth: '500px' }} value={netlist} />
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* Button to download the netlist */}
        <Button color="primary" onClick={createNetlistFile}>
          Download
        </Button>
        <Button onClick={close} color="primary" autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

NetlistModal.propTypes = {
  open: PropTypes.bool,
  close: PropTypes.func,
  netlist: PropTypes.string
}

const useStyles = makeStyles((theme) => ({
  appBar: {
    position: 'relative'
  },
  title: {
    marginLeft: theme.spacing(2),
    flex: 1
  },
  header: {
    padding: theme.spacing(5, 0, 6),
    color: theme.palette.text.primary
  },
  paper: {
    padding: theme.spacing(2),
    textAlign: 'center',
    backgroundColor: theme.palette.type === 'dark' ? theme.palette.grey[800] : '#404040',
    color: theme.palette.text.primary
  },
  helpDialog: {
    backgroundColor: theme.palette.background.default
  },
  helpToolbar: {
    backgroundColor: theme.palette.type === 'dark' ? theme.palette.grey[900] : theme.palette.primary.dark,
    color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.grey[900] : theme.palette.primary.dark)
  },
  helpSection: {
    padding: theme.spacing(3, 3.5),
    borderRadius: theme.spacing(1.5),
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    height: '100%',
    transition: theme.transitions.create(['box-shadow', 'transform'], { duration: 200 }),
    '&:hover': {
      boxShadow: theme.shadows[6]
    }
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2.5),
    color: theme.palette.text.primary
  },
  sectionIcon: {
    color: theme.palette.primary.main,
    fontSize: '1.7rem'
  },
  sectionTitle: {
    fontWeight: 600
  },
  shortcutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1.1, 1),
    borderRadius: theme.spacing(0.75),
    transition: theme.transitions.create('background-color', { duration: 150 }),
    '&:hover': {
      backgroundColor: theme.palette.action.hover
    }
  },
  shortcutLabel: {
    color: theme.palette.text.primary,
    fontWeight: 500
  },
  keyGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5)
  },
  keyChip: {
    fontFamily: 'monospace',
    fontWeight: 700,
    letterSpacing: '0.02em',
    backgroundColor: theme.palette.type === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200],
    color: theme.palette.text.primary,
    border: `1px solid ${theme.palette.divider}`
  },
  keyPlus: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem'
  },
  unitsTable: {
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary
  },
  unitsTableHeadCell: {
    fontWeight: 700,
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.type === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100]
  },
  modeBlock: {
    padding: theme.spacing(1.25, 1),
    borderRadius: theme.spacing(0.75),
    transition: theme.transitions.create('background-color', { duration: 150 }),
    '&:hover': {
      backgroundColor: theme.palette.action.hover
    }
  },
  modeTitle: {
    color: theme.palette.text.primary,
    fontWeight: 600
  },
  modeDescription: {
    color: theme.palette.text.secondary,
    lineHeight: 1.6
  },
  avatar: {
    width: theme.spacing(4),
    height: theme.spacing(4),
    backgroundColor: blue[100],
    color: blue[600]
  },
  delete: {
    backgroundColor: 'red',
    color: 'white',
    marginBottom: '10px'
  },
  flex_container: {
    display: 'flex',
    flexDirection: 'column'
    // justifyContent: 'space-evenly'
  },
  flex_item: {
    marginBottom: '10px'
  }
}))

// Screen to display information about as keyboard shortcuts, units table and simulation modes
export function HelpScreen ({ open, close }) {
  const classes = useStyles()

  const shortcuts = [
    { label: 'Undo', keys: ['Ctrl', 'Z'] },
    { label: 'Redo', keys: ['Ctrl', 'Shift', 'Z'] },
    { label: 'Zoom In', keys: ['Ctrl', '+'] },
    { label: 'Zoom Out', keys: ['Ctrl', '-'] },
    { label: 'Default Size', keys: ['Ctrl', 'Y'] },
    { label: 'Save Circuit', keys: ['Ctrl', 'S'] },
    { label: 'Print Circuit', keys: ['Ctrl', 'P'] },
    { label: 'Open Dialog', keys: ['Ctrl', 'O'] },
    { label: 'Export as JSON', keys: ['Ctrl', 'E'] },
    { label: 'Export as Image', keys: ['Ctrl', 'Shift', 'E'] },
    { label: 'Rotate Clockwise', keys: ['Alt', '→'] },
    { label: 'Rotate Anti-Clockwise', keys: ['Alt', '←'] },
    { label: 'Clear All', keys: ['Shift', 'Del'] }
  ]

  const units = [
    { suffix: 'T', name: 'Tera', factor: '10', exp: '12' },
    { suffix: 'G', name: 'Giga', factor: '10', exp: '9' },
    { suffix: 'Meg', name: 'Mega', factor: '10', exp: '6' },
    { suffix: 'K', name: 'Kilo', factor: '10', exp: '3' },
    { suffix: 'mil', name: 'Mil', factor: '25.4 X 10', exp: '-6' },
    { suffix: 'm', name: 'milli', factor: '10', exp: '-3' },
    { suffix: 'u', name: 'micro', factor: '10', exp: '-6' },
    { suffix: 'n', name: 'nano', factor: '10', exp: '-9' },
    { suffix: 'p', name: 'pico', factor: '10', exp: '-12' },
    { suffix: 'f', name: 'femto', factor: '10', exp: '-15' }
  ]

  const simulationModes = [
    {
      title: 'DC Solver',
      description: 'A DC simulation attempts to find a stable DC solution of your circuit.'
    },
    {
      title: 'DC Sweep',
      description: 'A DC Sweep will plot the DC solution of your circuit across different values of a parameter of a circuit element. You can sweep any numerical parameter of any circuit element in your circuit.'
    },
    {
      title: 'Transient Analysis',
      description: 'A Transient analysis does a Time-Domain Simulation of your circuit over a certain period of time.'
    },
    {
      title: 'AC Analysis',
      description: 'AC Analysis does a small signal analysis of your circuit. The input can be any voltage source or current source.'
    }
  ]

  return (
    <div>
      <Dialog fullScreen open={open} onClose={close} TransitionComponent={Transition} PaperProps={{
        className: classes.helpDialog
      }} >
        <AppBar position="static" elevation={0} className={classes.appBar}>
          <Toolbar variant="dense" className={classes.helpToolbar} >
            <IconButton edge="start" color="inherit" onClick={close} aria-label="close">
              <CloseIcon />
            </IconButton>
            <Typography variant="h6" className={classes.title}>
              Help
            </Typography>
            <Button autoFocus color="inherit" onClick={close}>
              close
            </Button>
          </Toolbar>
        </AppBar>
        <Container maxWidth="lg" className={classes.header}>
          <Grid
            container
            spacing={3}
            direction="row"
            justify="center"
            alignItems="stretch"
          >

            <Grid item xs={12} md={6}>
              <div className={classes.helpSection}>
                <div className={classes.sectionHeader}>
                  <KeyboardIcon className={classes.sectionIcon} />
                  <Typography variant="h5" component="p" className={classes.sectionTitle}>
                    Keyboard Shortcuts
                  </Typography>
                </div>
                {shortcuts.map((shortcut, index) => (
                  <React.Fragment key={shortcut.label}>
                    <div className={classes.shortcutRow}>
                      <Typography variant="body1" className={classes.shortcutLabel}>
                        {shortcut.label}
                      </Typography>
                      <div className={classes.keyGroup}>
                        {shortcut.keys.map((key, i) => (
                          <React.Fragment key={key}>
                            {i > 0 && <Typography component="span" className={classes.keyPlus}>+</Typography>}
                            <Chip label={key} size="small" className={classes.keyChip} />
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    {index < shortcuts.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </div>
            </Grid>

            <Grid item xs={12} md={6}>
              <div className={classes.helpSection}>
                <div className={classes.sectionHeader}>
                  <TableChartOutlinedIcon className={classes.sectionIcon} />
                  <Typography variant="h5" component="p" className={classes.sectionTitle}>
                    Units Table
                  </Typography>
                </div>
                <TableContainer>
                  <Table className={classes.unitsTable} aria-label="units table" size="small">
                    <caption>Ngspice scale factors naming conventions</caption>
                    <TableHead>
                      <TableRow>
                        <TableCell align="center" className={classes.unitsTableHeadCell}>SUFFIX</TableCell>
                        <TableCell align="center" className={classes.unitsTableHeadCell}>NAME</TableCell>
                        <TableCell align="center" className={classes.unitsTableHeadCell}>FACTOR</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {units.map((unit) => (
                        <TableRow key={unit.suffix} hover>
                          <TableCell align="center">{unit.suffix}</TableCell>
                          <TableCell align="center">{unit.name}</TableCell>
                          <TableCell align="center">{unit.factor}<sup>{unit.exp}</sup></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            </Grid>

            <Grid item xs={12}>
              <div className={classes.helpSection}>
                <div className={classes.sectionHeader}>
                  <TuneIcon className={classes.sectionIcon} />
                  <Typography variant="h5" component="p" className={classes.sectionTitle}>
                    Simulation Modes
                  </Typography>
                </div>
                <Grid container spacing={2}>
                  {simulationModes.map((mode) => (
                    <Grid item xs={12} sm={6} key={mode.title}>
                      <div className={classes.modeBlock}>
                        <Typography variant="h6" align='left' className={classes.modeTitle} gutterBottom>
                          {mode.title}
                        </Typography>
                        <Typography variant="body2" align='left' className={classes.modeDescription}>
                          {mode.description}
                        </Typography>
                      </div>
                    </Grid>
                  ))}
                </Grid>
              </div>
            </Grid>
          </Grid>
        </Container>
      </Dialog>
    </div >
  )
}

HelpScreen.propTypes = {
  open: PropTypes.bool,
  close: PropTypes.func
}

// Image Export Dialog box
const ImgTypes = ['PNG', 'JPG', 'SVG']
export function ImageExportDialog (props) {
  const classes = useStyles()
  const { onClose, open } = props

  const handleClose = () => {
    onClose('')
  }

  const handleListItemClick = (value) => {
    onClose(value)
  }

  return (
    <Dialog onClose={handleClose} aria-labelledby="image-export-dialog-title" open={open}>
      <DialogTitle id="image-export-dialog-title">Select Image type</DialogTitle>
      <List>
        {ImgTypes.map((img) => (
          <ListItem button onClick={() => handleListItemClick(img)} key={img}>
            <ListItemAvatar>
              <Avatar className={classes.avatar}>
                {img.charAt(0).toUpperCase()}
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={img} />
          </ListItem>
        ))}
      </List>
      <DialogActions>
        <Button onClick={handleClose} color="primary" autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

ImageExportDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired
}

//  home button dialog
export function HomeDialog ({ open, gridRef, routeVal, onClose, schSave }) {
  const classes = useStyles()
  // const abc = schSave
  const dispatch = useDispatch()
  console.log(open)
  useEffect(() => {
    dispatch(fetchRole())
  }, [dispatch])
  var homeURL = ''
  if (routeVal === 'home') {
    homeURL = `${window.location.protocol}\\\\${window.location.host}/`
  } else {
    homeURL = `${window.location.protocol}\\\\${window.location.host}/eda/#/${routeVal}`
  }

  console.log(homeURL)
  const handleClose = () => {
    onClose('')
  }

  // handle Notification Snackbar
  const [snacOpen, setSnacOpen] = React.useState(false)
  const [message, setMessage] = React.useState('')

  const handleSnacClick = () => {
    setSnacOpen(true)
  }

  const handleSnacClose = (event, reason) => {
    if (reason === 'clickaway') {
      return
    }
    setSnacOpen(false)
  }

  const auth = useSelector((state) => state.authReducer)

  // handle schemaname dialog box
  const [schemanameopen, setSchemaNameOpen] = React.useState(false)

  const handleSchemaNameOpen = (e) => {
    e.preventDefault()
    console.log(e)
    console.log(routeVal)

    if (auth.isAuthenticated !== true) {
      setMessage('You are not Logged In')
      handleSnacClick()
    } else {
      setSchemaNameOpen(true)
    }
  }

  const handleSchemaNameClose = () => {
    setSchemaNameOpen(false)
  }

  return (
    <Dialog onClose={handleClose} aria-labelledby="image-export-dialog-title" open={open}>
      <DialogTitle id="image-export-dialog-title">Save changes to the untitled circuit? Your changes will be lost if you do not save it.</DialogTitle>
      <DialogContent className={classes.flex_container} >
        <Button variant="contained" className={classes.flex_item} color="primary" size="large" onClick={handleSchemaNameOpen} >
              Save
        </Button>
        <Button variant="contained" color="primary" className={classes.flex_item}size="large" onClick={() => { window.open(homeURL, '_self') }}>
              Dont Save
        </Button>
        <Button variant="contained" className={classes.delete} size="large" onClick={handleClose}>
              Cancel
        </Button>
      </DialogContent>
      {gridRef && routeVal &&
                <SchematicNameDialog open={schemanameopen} gridRef={gridRef} routeVal={routeVal} schSave={schSave} onClose={handleSchemaNameClose} />
      }
      <SimpleSnackbar open={snacOpen} close={handleSnacClose} message={message} />
    </Dialog>
  )
}

HomeDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  gridRef: PropTypes.object.isRequired,
  schSave: PropTypes.object.isRequired,
  routeVal: PropTypes.string.isRequired
}

export function SchematicNameDialog ({ open, gridRef, routeVal, onClose, schSave }) {
  const classes = useStyles()
  const dispatch = useDispatch()
  console.log(open)
  useEffect(() => {
    dispatch(fetchRole())
  }, [dispatch])
  var homeURL = ''
  console.log(routeVal)
  if (routeVal === 'home') {
    homeURL = `${window.location.protocol}\\\\${window.location.host}/`
  } else {
    homeURL = `${window.location.protocol}\\\\${window.location.host}/eda/#/${routeVal}`
  }

  console.log(homeURL)
  const handleClose = () => {
    onClose('')
  }

  // handle Notification Snackbar
  const [snacOpen, setSnacOpen] = React.useState(false)
  const [message, setMessage] = React.useState('')

  const handleSnacClick = () => {
    setSnacOpen(true)
  }

  const handleSave = (version, newSave, save_id) => {
    if (!newSave) {
      // window.location = '#/editor?id=' + window.location.href.split('id=')[1].substr(0, 36) + '&version=' + version + '&branch=' + window.location.href.split('branch=')[1].substr(0)
      // window.location.reload()
      // window.open(homeURL, '_self')
      window.location = homeURL
      window.location.reload()
    } else {
      // window.location = '#/editor?id=' + save_id + '&version=' + version + '&branch=master'
      // window.location.reload()
      window.open(homeURL, '_self')
    }
  }

  const handleSnacClose = (event, reason) => {
    if (reason === 'clickaway') {
      return
    }
    setSnacOpen(false)
  }

  const auth = useSelector((state) => state.authReducer)

  // Image Export of Schematic Diagram
  async function exportImage (type) {
    const svg = document.querySelector('#divGrid > svg').cloneNode(true)
    svg.removeAttribute('style')
    svg.setAttribute('width', gridRef.current.scrollWidth)
    svg.setAttribute('height', gridRef.current.scrollHeight)
    const canvas = document.createElement('canvas')
    canvas.width = gridRef.current.scrollWidth
    canvas.height = gridRef.current.scrollHeight
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'
    const images = svg.getElementsByTagName('image')
    for (const image of images) {
      const data = await fetch(image.getAttribute('xlink:href')).then((v) => {
        return v.text()
      })
      image.removeAttribute('xlink:href')
      image.setAttribute(
        'href',
        'data:image/svg+xml;base64,' + window.btoa(data)
      )
    }
    const ctx = canvas.getContext('2d')
    ctx.mozImageSmoothingEnabled = true
    ctx.webkitImageSmoothingEnabled = true
    ctx.msImageSmoothingEnabled = true
    ctx.imageSmoothingEnabled = true
    const pixelRatio = window.devicePixelRatio || 1
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    return new Promise((resolve) => {
      if (type === 'SVG') {
        const svgdata = new XMLSerializer().serializeToString(svg)
        resolve('<?xml version="1.0" encoding="UTF-8"?>' + svgdata)
        return
      }
      const v = Canvg.fromString(ctx, svg.outerHTML)
      v.render().then(() => {
        let image = ''
        if (type === 'JPG') {
          const imgdata = ctx.getImageData(0, 0, canvas.width, canvas.height)
          for (let i = 0; i < imgdata.data.length; i += 4) {
            if (imgdata.data[i + 3] === 0) {
              imgdata.data[i] = 255
              imgdata.data[i + 1] = 255
              imgdata.data[i + 2] = 255
              imgdata.data[i + 3] = 255
            }
          }
          ctx.putImageData(imgdata, 0, 0)
          image = canvas.toDataURL('image/jpeg', 1.0)
        } else {
          if (type === 'PNG') {
            image = canvas.toDataURL('image/png')
          }
        }
        resolve(image)
      })
    })
  }

  // handle Save Schematic onCloud
  const handleSchSave = () => {
    if (auth.isAuthenticated !== true) {
      setMessage('You are not Logged In')
      handleSnacClick()
    } else {
      const xml = Save()
      dispatch(setSchXmlData(xml))
      const title = schSave.title
      const description = schSave.description
      exportImage('PNG').then((res) => {
        dispatch(saveSchematic(title, description, xml, res, false, null, handleSave))
      })
      setMessage('Saved Successfully')
      handleSnacClick()
    }
  }
  const titleHandler = (e) => {
    e.preventDefault()
    dispatch(setTitle(`* ${e.target.value}`))
    dispatch(setSchTitle(`${e.target.value}`))
  }
  return (
    <Dialog onClose={handleClose} aria-labelledby="image-export-dialog-title" open={open}>
      <DialogTitle id="image-export-dialog-title">Confirm the Title for the Schematic</DialogTitle>
      <DialogContent className={classes.flex_container} >
        <Hidden xsDown>
          <Input
            style={{ marginBottom: '10px' }}
            className={classes.input}
            color="secondary"
            value={schSave.title === 'Untitled_Schematic' ? 'Untitled_Schematic' : schSave.title}
            onChange={titleHandler}
            inputProps={{ 'aria-label': 'SchematicTitle' }}
          />
        </Hidden>
        <Button variant="contained" color="primary" size="large" onClick={handleSchSave} >
              Save
        </Button>
      </DialogContent>
      <SimpleSnackbar open={snacOpen} close={handleSnacClose} message={message} />
    </Dialog>
  )
}

SchematicNameDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  gridRef: PropTypes.object.isRequired,
  schSave: PropTypes.object.isRequired,
  routeVal: PropTypes.string.isRequired
}

// Dialog box to open saved Schematics
export function OpenSchDialog (props) {
  const { open, close, openLocal, openKicad } = props
  const [isLocal, setisLocal] = React.useState(true)
  const [isGallery, setisGallery] = React.useState(false)
  const [isKicad, setisKicad] = React.useState(false)
  const schSave = useSelector(state => state.saveSchematicReducer)
  const auth = useSelector(state => state.authReducer)
  const schematics = useSelector(state => state.dashboardReducer.schematics)
  const gallerySchSample = useSelector(state => state.galleryReducer.schematics)
  const dispatch = useDispatch()
  function getDate (jsonDate) {
    const json = jsonDate
    const date = new Date(json)
    const dateTimeFormat = new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const [{ value: month }, , { value: day }, , { value: hour }, , { value: minute }, , { value: second }] = dateTimeFormat.formatToParts(date)
    return `${day} ${month} ${hour}:${minute}:${second}`
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth='md'
      TransitionComponent={Transition}
      keepMounted
      aria-labelledby="open-dialog-title"
      aria-describedby="open-dialog-description"
    >
      <DialogTitle id="open-dialog-title" onClose={close}>
        <Typography variant="h6">{'Open Schematic'}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <DialogContentText id="open-dialog-description" >
          {isLocal
            ? <center> <Button variant="outlined" fullWidth={true} size="large" onClick={() => { openLocal(); close() }} color="primary">
              Upload File
            </Button></center>
            : isGallery
              ? <Grid item xs={12} sm={12}>
                {/* Listing Gallery Schematics */}
                <TableContainer component={Paper} style={{ maxHeight: '45vh' }}>
                  <Table stickyHeader size="small" aria-label="simple table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="center">Name</TableCell>
                        <TableCell align="center">Description</TableCell>
                        <TableCell align="center">Launch</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <>
                        {gallerySchSample.map(
                          (sch) => {
                            return (
                              <TableRow key={sch.save_id}>
                                <TableCell align="center">{sch.name}</TableCell>
                                <TableCell align="center">
                                  <Tooltip title={sch.description !== null ? sch.description : 'No description'} >
                                    <span>
                                      {sch.description !== null ? sch.description.slice(0, 30) + (sch.description.length < 30 ? '' : '...') : '-'}
                                    </span>
                                  </Tooltip>
                                </TableCell>
                                <TableCell align="center">
                                  <Button
                                    size="small"
                                    color="primary"
                                    onClick={() => { dispatch(fetchGallerySchematic(sch.save_id)) }}
                                    variant={schSave.details.save_id === undefined ? 'outlined' : schSave.details.save_id !== sch.save_id ? 'outlined' : 'contained'}
                                  >
                                    Launch
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          }
                        )}
                      </>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
              : isKicad
                ? <center> <Button variant="outlined" fullWidth={true} size="large" onClick={() => { openKicad(); close() }} color="primary">
                Upload .sch File
                </Button> </center>
                : <Grid item xs={12} sm={12}>
                  {/* Listing Saved Schematics */}
                  {schematics.length === 0
                    ? <Typography variant="subtitle1" gutterBottom>
                    Hey {auth.user.username} , You dont have any saved schematics...
                    </Typography>
                    : <TableContainer component={Paper} style={{ maxHeight: '45vh' }}>
                      <Table stickyHeader size="small" aria-label="simple table">
                        <TableHead>
                          <TableRow>
                            <TableCell align="center">Name</TableCell>
                            <TableCell align="center">Description</TableCell>
                            <TableCell align="center">Created</TableCell>
                            <TableCell align="center">Updated</TableCell>
                            <TableCell align="center">Launch</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <>
                            {schematics.map(
                              (sch) => {
                                return (
                                  <TableRow key={sch.save_id}>
                                    <TableCell align="center">{sch.name}</TableCell>
                                    <TableCell align="center">
                                      <Tooltip title={sch.description !== null ? sch.description : 'No description'} >
                                        <span>
                                          {sch.description !== null ? sch.description.slice(0, 30) + (sch.description.length < 30 ? '' : '...') : '-'}
                                        </span>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell align="center">{getDate(sch.create_time)}</TableCell>
                                    <TableCell align="center">{getDate(sch.save_time)}</TableCell>
                                    <TableCell align="center">
                                      <Button
                                        size="small"
                                        color="primary"
                                        onClick={() => { dispatch(fetchSchematic(sch.save_id)) }}
                                        variant={schSave.details.save_id === undefined ? 'outlined' : schSave.details.save_id !== sch.save_id ? 'outlined' : 'contained'}
                                      >
                                      Launch
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )
                              }
                            )}
                          </>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  }
                </Grid>
          }
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant={isLocal ? 'outlined' : 'text'} onClick={() => { setisLocal(true); setisGallery(false); setisKicad(false) }} color="secondary">
          Local
        </Button>
        <Button variant={isGallery ? 'outlined' : 'text'} onClick={() => { dispatch(fetchGallery()); setisLocal(false); setisGallery(true) }} color="secondary">
          Gallery
        </Button>
        <Button variant={isKicad ? 'outlined' : 'text'} onClick={() => { setisLocal(false); setisGallery(false); setisKicad(true) }} color="secondary">
          KiCad
        </Button>
        {auth.isAuthenticated !== true
          ? <></>
          : <Button variant={!isGallery & !isLocal & !isKicad ? 'outlined' : 'text'} onClick={() => { dispatch(fetchSchematics()); setisLocal(false); setisGallery(false); setisKicad(false) }} color="secondary" >
            on Cloud
          </Button>
        }
        <Button onClick={close} color="primary" autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

OpenSchDialog.propTypes = {
  close: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  openLocal: PropTypes.func.isRequired,
  openKicad: PropTypes.func.isRequired
}

function SimpleSnackbar ({ open, close, message }) {
  return (
    <div>
      <Snackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left'
        }}
        open={open}
        autoHideDuration={4000}
        onClose={close}
        message={message}
        action={
          <React.Fragment>
            <IconButton size="small" aria-label="close" color="inherit" onClick={close}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </React.Fragment>
        }
      />
    </div>
  )
}

SimpleSnackbar.propTypes = {
  open: PropTypes.bool,
  close: PropTypes.func,
  message: PropTypes.string
}

function TabPanel (props) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      aria-labelledby={`full-width-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box>
          {children}
        </Box>
      )}
    </div>
  )
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired
}

function LibraryRow ({ library }) {
  const dispatch = useDispatch()
  const [open, setopen] = React.useState(false)
  const classes = useStyles()
  const components = useSelector(state => state.schematicEditorReducer.components)

  const handleAppply = (lib) => {
    dispatch(fetchLibrary(lib.id))
  }

  const handleUnapply = (lib) => {
    dispatch(removeLibrary(lib.id))
  }

  const handleOpen = () => {
    if (components[library.id].length === 0) { dispatch(fetchComponents(library.id)) }
    setopen(!open)
  }

  return (
    <Paper style={{ marginBottom: '.5rem' }}>
      <ListSubheader>
        <ListItem onClick={handleOpen} >
          {open ? <ExpandLess /> : <ExpandMore />}
          <ListItemText primary={library.library_name.slice(0, -4)} />
          <ListItemSecondaryAction>
            {(!library.default && !library.additional) &&
              <Button variant="contained" size="small"
                style={{ backgroundColor: '#ff1744', color: '#ffffff', margin: '.5rem' }}
                onClick={() => { dispatch(deleteLibrary(library.id)) }} hidden={library.default || library.additional} >
                Delete
              </Button>
            }
            {library.active
              ? <Button variant="contained" size="small" color="secondary"
                onClick={() => { handleUnapply(library) }} style={{ margin: '.5rem' }}>
                Remove
              </Button>
              : <Button variant="contained" size="small" color="primary"
                onClick={() => { handleAppply(library) }} style={{ margin: '.5rem' }}>
                Use
              </Button>
            }
          </ListItemSecondaryAction>
        </ListItem>
      </ListSubheader>

      {(components[library.id]) &&
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
            {components[library.id].map(component => {
              return (
                <ListItem alignItems='center' key={component.id} dense className={classes.nested}>
                  <ListItemText primary={component.name} secondary={component.description} />
                </ListItem>
              )
            })}
          </List>
        </Collapse>
      }
    </Paper>
  )
}

LibraryRow.propTypes = {
  library: PropTypes.any.isRequired
}

export function SelectLibrariesModal ({ open, close }) {
  const allLibraries = useSelector(state => state.schematicEditorReducer.allLibraries)
  const libraries = useSelector(state => state.schematicEditorReducer.libraries)
  const uploadSuccess = useSelector(state => state.schematicEditorReducer.uploadSuccess)
  const auth = useSelector(state => state.authReducer)
  const dispatch = useDispatch()
  const classes = useStyles()
  const [activeLibraries, setActiveLibraries] = React.useState(allLibraries)
  const [message, setMessage] = React.useState('')
  const [uploadDisable, setUploadDisable] = React.useState(false)
  const [tabValue, setTabValue] = React.useState(0)

  useEffect(() => {
    if (open === true) { dispatch(fetchAllLibraries()) }
  }, [dispatch, open])

  useEffect(() => {
    setUploadDisable(false)
    if (uploadSuccess === true) {
      setMessage('Upload Successful')
      setsnacOpen(true)
      dispatch(resetUploadSuccess())
      dispatch(fetchAllLibraries())
    }
    if (uploadSuccess === false) {
      setMessage('An Error Occured')
      setsnacOpen(true)
      dispatch(resetUploadSuccess())
    }
  }, [dispatch, uploadSuccess])

  useEffect(() => {
    const updateActive = () => {
      const active = []
      if (allLibraries !== undefined) {
        allLibraries.forEach((element) => {
          element.active = false
          libraries.forEach(ele => {
            if (ele.id === element.id) {
              element.active = true
            }
          })
          active.push(element)
        })
      }
      setActiveLibraries(active)
    }

    if (allLibraries !== undefined) {
      updateActive()
    }
  }, [libraries, allLibraries])

  const fileUpload = React.useRef(null)

  const handlFileUpload = (event) => {
    setUploadDisable(true)
    const files = event.target.files
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }
    dispatch(uploadLibrary(formData))
  }

  const handleLibUploadOpen = () => {
    fileUpload.current.click()
  }

  const [snacOpen, setsnacOpen] = React.useState(false)
  const handleSnacClose = () => {
    setsnacOpen(false)
  }

  const handleTabChange = (event, value) => {
    setTabValue(value)
  }

  return (
    <Dialog
      className="modal-library-detail"
      open={open}
      onClose={close}
      scroll="paper"
      fullWidth
      maxWidth="md"
      TransitionComponent={Transition}
      aria-labelledby="library-select-dialog"
      aria-describedby="library-select"
    >
      <DialogTitle>
        <Typography variant="h6">{'Manage libraries in the workspace'}</Typography>
        <Divider fullWidth />
        {/* </DialogTitle>
      <DialogTitle> */}
        <Tabs value={tabValue} onChange={handleTabChange} centered >
          <Tab label="DEFAULT" />
          <Tab label="ADDITIONAL" />
          <Tab label="UPLOADED" />
        </Tabs>
      </DialogTitle>
      <DialogContent dividers>
        <DialogContentText id="open-dialog-description" >

          {activeLibraries !== undefined
            ? <>
              <TabPanel value={tabValue} index={0}>
                <List fullwidth className={classes.root}>
                  {allLibraries.find(lib => {
                    return lib.default === true
                  })
                    ? allLibraries.map(library => {
                      if (library.default) { return <LibraryRow library={library} /> }
                      return <></>
                    })
                    : <p>Nothing to show</p>
                  }
                </List>
              </TabPanel>
              <TabPanel value={tabValue} index={1}>
                <List fullwidth className={classes.root}>
                  {allLibraries.find(lib => {
                    return lib.additional === true
                  })
                    ? allLibraries.map(library => {
                      if (library.additional) { return <LibraryRow library={library} /> }
                      return <></>
                    })
                    : <p>Nothing to show</p>
                  }
                </List>
              </TabPanel>
              <TabPanel value={tabValue} index={2}>
                <List fullwidth className={classes.root}>
                  {allLibraries.find(lib => {
                    return (lib.additional === false && lib.default === false)
                  })
                    ? allLibraries.map(library => {
                      if (!library.default && !library.additional) { return <LibraryRow library={library} /> }
                      return <></>
                    })
                    : <p>Nothing to show</p>
                  }
                </List>
              </TabPanel>
            </>
            : <p>Nothing To Show</p>
          }
        </DialogContentText>
      </DialogContent>
      {auth.isAuthenticated && tabValue === 2 &&
        <DialogActions style={{ display: 'flex', justifyContent: 'center' }}>
          <div>
            {uploadDisable &&
              <div style={{ paddingBottom: '10px' }}>
                <Alert severity="info">Files are being uploaded please wait.</Alert>
              </div>
            }
            <Button display="block" variant="contained" size="large" color="primary"
              onClick={() => { handleLibUploadOpen() }} disabled={uploadDisable} disableElevation={true}>
              Upload .lib and .dcm Files
              <input type="file" multiple={true} accept=".lib,.dcm" ref={fileUpload} onChange={handlFileUpload} style={{ display: 'none' }} />
            </Button>
            <SimpleSnackbar open={snacOpen} close={handleSnacClose} message={message} />
          </div>
        </DialogActions>
      }
    </Dialog>
  )
}

SelectLibrariesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired
}