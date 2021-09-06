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

# Error - truffle-flattener cannot handle unchecked blocks - https://github.com/nomiclabs/truffle-flattener/issues/77
# echo "\$ truffle-flattener contracts/ERC721PresetMinterPauserAutoId.sol > flattened/ERC721PresetMinterPauserAutoId_flattened.sol ..."
# truffle-flattener contracts/ERC721PresetMinterPauserAutoId.sol > flattened/ERC721PresetMinterPauserAutoId_flattened.sol
#
echo "\$ truffle-flattener contracts/SimpleERC721.sol > flattened/SimpleERC721_flattened.sol ..."
truffle-flattener contracts/SimpleERC721.sol > flattened/SimpleERC721_flattened.sol
