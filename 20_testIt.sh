#!/bin/sh

OUTPUTFILE=testIt.out

npx hardhat test | tee $OUTPUTFILE
grep txFee $OUTPUTFILE | uniq
