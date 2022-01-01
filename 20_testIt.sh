#!/bin/sh

OUTPUTFILE=testIt.out

npx hardhat coverage | tee $OUTPUTFILE
grep txFee $OUTPUTFILE | uniq
