import test from 'node:test';import assert from 'node:assert/strict';import {BoardView} from '../src/board.js';
test('click selection captures on the square, preserving the click target through pointer up',()=>{
 const events={},clicks=[];let captured=false;
 const square={dataset:{square:'e2'},closest(){return this;},querySelector(){return null;},setPointerCapture(){captured=true;},hasPointerCapture(){return captured;},releasePointerCapture(){captured=false;}};
 const board={addEventListener(name,fn){events[name]=fn;},contains(node){return node===square;},setPointerCapture(){assert.fail('Capturing on the board swallows square clicks.');}};
 const renderer=new BoardView(board,{click:s=>clicks.push(s),drop:()=>assert.fail('A click must not drop.'),canDrag:()=>true,settings:()=>({})});
 events.pointerdown({target:square,button:0,clientX:10,clientY:10,pointerId:1});assert.equal(captured,true);
 events.pointerup({target:square,pointerId:1,type:'pointerup'});assert.equal(captured,false);
 renderer.activate('e2');assert.deepEqual(clicks,['e2']);
});
