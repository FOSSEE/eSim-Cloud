import React from 'react';
import SvgIcon from '@material-ui/core/SvgIcon';

export const ConnectorIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 12 2 L 12 22 M 2 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </SvgIcon>
);

export const SourceIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M 8 12 Q 10 9 12 12 T 16 12" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M 12 5 L 12 2 M 12 19 L 12 22 M 5 12 L 2 12 M 19 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);

export const PassiveIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 2 12 L 6 12 L 7.5 7 L 10.5 17 L 13.5 7 L 16.5 17 L 18 12 L 22 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </SvgIcon>
);

export const AnalogIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 6 5 L 18 12 L 6 19 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M 2 9 L 6 9 M 2 15 L 6 15 M 18 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
    <text x="8" y="11" fontSize="6" fill="currentColor" fontWeight="bold" fontFamily="sans-serif">+</text>
    <text x="8" y="17" fontSize="6" fill="currentColor" fontWeight="bold" fontFamily="sans-serif">-</text>
  </SvgIcon>
);

export const DiodeIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 7 8 L 13 12 L 7 16 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M 13 8 L 13 16" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 2 12 L 7 12 M 13 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);

export const TransistorIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 10 6 L 10 18" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 2 12 L 10 12" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 10 9 L 16 3 L 16 1 M 16 3 L 22 3" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 10 15 L 16 21 L 16 23 M 16 21 L 22 21" stroke="currentColor" strokeWidth="2" fill="none"/>
    <polygon points="16,21 13,19 15,17" fill="currentColor"/>
  </SvgIcon>
);

export const IndicatorIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 7 10 L 13 14 L 7 18 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M 13 10 L 13 18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M 2 14 L 7 14 M 13 14 L 22 14" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M 11 8 L 15 4 M 14 4 L 15 4 L 15 5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M 8 6 L 12 2 M 11 2 L 12 2 L 12 3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
  </SvgIcon>
);

export const SwitchIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <circle cx="7" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="17" cy="12" r="1.5" fill="currentColor"/>
    <path d="M 2 12 L 5.5 12" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 18.5 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 7 12 L 15 7" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);

export const ModellingBlockIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <rect x="6" y="4" width="12" height="16" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M 2 6 L 6 6 M 2 10 L 6 10 M 2 14 L 6 14 M 2 18 L 6 18" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 18 6 L 22 6 M 18 10 L 22 10 M 18 14 L 22 14 M 18 18 L 22 18" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);

export const ElectromechanicalIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M 9 14 L 9 10 L 12 12 L 15 10 L 15 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M 5 12 L 2 12 M 19 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);

export const PowerIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 12 18 L 12 8" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M 8 8 L 16 8 L 12 2 Z" fill="currentColor" />
    <path d="M 8 22 L 16 22" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);

export const DigitalIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M 8 6 L 12 6 A 6 6 0 0 1 12 18 L 8 18 Z" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M 2 10 L 8 10 M 2 14 L 8 14 M 18 12 L 22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
  </SvgIcon>
);
