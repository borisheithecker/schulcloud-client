import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import YouTube from "react-youtube";
import { relative } from 'path';

const styles = {
    root: {
        width: '100%',
        height: 0,
        overflow: 'hidden',
        position: "relative",
        paddingBottom: "56.25%",
        paddingTop: 0
    },
    link: {
        color: "white",
        fontSize: "180%",
    },
    image: {
        width: '100%',
        height: '100%',
        objectFit: 'contain'
    }
};

@withStyles(styles)
export default class Link extends React.Component {

    render() {
        const { classes, youtubeId, preview } = this.props;
        if(!preview) {
            return <YouTube 
                        containerClassName = {classes.root}
                        videoId={youtubeId}
                        opts={{
                            position: 'absolute',
                            height: '100%',
                            width: '100%',
                            top: 0,
                            left: 0,
                        }}
                    />;
        } else {
            return <img 
                        className = {classes.image}
                        src={`https://img.youtube.com/vi/${youtubeId}/0.jpg`} 
                    />;
        }
    }
}