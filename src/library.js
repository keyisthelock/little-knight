export const OPENINGS=[
 {name:'Italian Game',eco:'C50',moves:'e4 e5 Nf3 Nc6 Bc4',idea:'Develop towards the centre. The bishop on c4 looks towards f7; castle before launching an attack.'},
 {name:'Queen’s Gambit',eco:'D06',moves:'d4 d5 c4',idea:'Challenge Black’s central pawn with a wing pawn. Develop pieces while maintaining central pressure.'},
 {name:'Sicilian Defence',eco:'B20',moves:'e4 c5',idea:'Black attacks d4 from the flank. The asymmetric pawn structure creates different plans for both sides.'},
 {name:'French Defence',eco:'C00',moves:'e4 e6 d4 d5',idea:'Black challenges White’s centre. Decide whether to exchange or advance before finding squares for the pieces.'},
 {name:'Caro–Kann Defence',eco:'B10',moves:'e4 c6 d4 d5',idea:'Support the central break with a c-pawn. Aim for sound development; the c8 bishop can often develop before e6.'},
 {name:'Ruy Lopez',eco:'C60',moves:'e4 e5 Nf3 Nc6 Bb5',idea:'Put pressure on the knight defending e5. Develop and castle; the threat is often positional rather than an immediate pawn win.'}
];
export const CHALLENGES=[
 {id:'back-rank',title:'The last rank',fen:'6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',bestUci:'e1e8',line:'Re8#',goal:'mate',topic:'missedMate',played:'Back-rank practice'},
 {id:'queen-net',title:'A protected queen',fen:'7k/6pp/5K2/8/8/8/6Q1/8 w - - 0 1',bestUci:'g2g7',line:'Qg7#',goal:'mate',topic:'missedMate',played:'Queen and king coordination'},
 {id:'fools-mate',title:'An exposed diagonal',fen:'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',bestUci:'d8h4',line:'Qh4#',goal:'mate',topic:'missedMate',played:'Look for forcing checks'}
];
