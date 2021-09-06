#!/bin/sh
# ----------------------------------------------------------------------------------------------
# Flatten solidity files
#
# Enjoy. (c) The Optino Project. GPLv2
# ----------------------------------------------------------------------------------------------

echo "\$ rm -rf flattened/ ..."
rm -rf flattened/
echo "\$ mkdir flattened/ ..."
mkdir flattened/
echo "\$ truffle-flattener contracts/MyERC721.sol > flattened/MyERC721_flattened.sol ..."
truffle-flattener contracts/MyERC721.sol > flattened/MyERC721_flattened.sol
