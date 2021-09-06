pragma solidity ^0.8.0;

import "./openzeppelin/token/ERC721/ERC721.sol";

contract SimpleERC721 is ERC721 {
    constructor() ERC721("SimpleERC721", "SE7") {
    }
}
