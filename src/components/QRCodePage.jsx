import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../ThemeContext';

const API = 'https://mon-planning-production.up.railway.app/api';
const APP_URL = 'https://planning-frontend-production.up.railway.app';

function QRMatrix({ value, size=200 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if(!canvasRef.current)return;
    const canvas=canvasRef.current;const ctx=canvas.getContext('2d');const cells=21;const cell=size/cells;
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000000';
    const data=[];
    for(let i=0;i<cells;i++){data.push([]);for(let j=0;j<cells;j++){const hash=(i*17+j*13+value.charCodeAt((i+j)%value.length))%3;data[i].push(hash===0);}}
    const corners=[[0,0],[0,14],[14,0]];
    corners.forEach(([r,c])=>{for(let i=0;i<7;i++)for(let j=0;j<7;j++){data[r+i][c+j]=i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4);}});
    for(let i=0;i<cells;i++)for(let j=0;j<cells;j++){if(data[i][j])ctx.fillRect(j*cell,i*cell,cell,cell);}
  },[value,size]);
  return <canvas ref={canvasRef} width={size} height={size} style={{display:'block'}}/>;
}

